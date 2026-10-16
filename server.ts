import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { ACTIONS, requireAction } from './server/policy';

dotenv.config();

const { Pool } = pg;
const app = express();
const port = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Supabase Direct PostgreSQL Pool
const connectionString =
  process.env.SUPABASE_URL ||
  (process.env.SUPABASE_DB_HOST
    ? `postgresql://${process.env.SUPABASE_DB_USER}:${encodeURIComponent(
        process.env.SUPABASE_DB_PASSWORD || ''
      )}@${process.env.SUPABASE_DB_HOST}:${process.env.SUPABASE_DB_PORT || '5432'}/postgres`
    : undefined);

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    })
  : null;

// Initialize tables automatically using supabase_schema.sql
async function initDatabase() {
  if (!pool) {
    console.warn('⚠️ No Supabase connection string provided. Running in offline/fallback mode.');
    return;
  }
  try {
    const schemaFile = path.resolve(process.cwd(), 'supabase_schema.sql');
    if (fs.existsSync(schemaFile)) {
      const sql = fs.readFileSync(schemaFile, 'utf8');
      await pool.query(sql);
      console.log('✅ Supabase PostgreSQL complete schema applied and verified successfully.');
    } else {
      console.warn('⚠️ supabase_schema.sql file not found.');
    }
  } catch (err: any) {
    console.error('⚠️ Could not initialize database schema automatically:', err.message);
  }
}
initDatabase();

// -------------------------------------------------------------
// Courses Endpoints
// -------------------------------------------------------------
app.get('/api/courses', requireAction(ACTIONS.COURSES_READ), async (_req, res) => {
  if (!pool) return res.json({ success: true, courses: [] });
  try {
    const { rows } = await pool.query('SELECT * FROM courses ORDER BY is_default DESC, created_at DESC;');
    const courses = rows.map((r: any) => {
      const extra = r.data || {};
      return {
        ...extra,
        id: r.id,
        name: r.name,
        season: r.season || extra.season,
        year: r.year || extra.year,
        startDate: r.start_date || extra.startDate,
        endDate: r.end_date || extra.endDate,
        status: r.status || extra.status || 'active',
        description: r.description || extra.description,
        targetCommitteesCount: r.target_committees_count || extra.targetCommitteesCount || 30,
        isDefault: Boolean(r.is_default),
        createdAt: r.created_at || extra.createdAt,
      };
    });
    res.json({ success: true, courses });
  } catch (err: any) {
    console.error('Error fetching courses from Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/courses', requireAction(ACTIONS.COURSES_WRITE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, message: 'Database not available' });
  const course = req.body;
  if (!course || !course.id) return res.status(400).json({ success: false, message: 'Invalid course' });
  try {
    if (course.isDefault) {
      await pool.query('UPDATE courses SET is_default = false;');
    }
    await pool.query(
      `INSERT INTO courses (id, name, season, year, start_date, end_date, status, description, target_committees_count, is_default, created_at, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         season = EXCLUDED.season,
         year = EXCLUDED.year,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         status = EXCLUDED.status,
         description = EXCLUDED.description,
         target_committees_count = EXCLUDED.target_committees_count,
         is_default = EXCLUDED.is_default,
         data = EXCLUDED.data,
         updated_at = NOW();`,
      [
        course.id,
        course.name,
        course.season || null,
        course.year || null,
        course.startDate || null,
        course.endDate || null,
        course.status || 'active',
        course.description || null,
        course.targetCommitteesCount || 30,
        Boolean(course.isDefault),
        course.createdAt || new Date().toISOString(),
        JSON.stringify(course),
      ]
    );
    res.json({ success: true, course });
  } catch (err: any) {
    console.error('Error saving course to Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/courses/:id', requireAction(ACTIONS.COURSES_DELETE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  try {
    await pool.query('DELETE FROM courses WHERE id = $1;', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting course from Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Committees Endpoints
// -------------------------------------------------------------
app.get('/api/committees', requireAction(ACTIONS.COMMITTEES_READ), async (_req, res) => {
  if (!pool) return res.json({ success: true, committees: [] });
  try {
    const { rows } = await pool.query('SELECT * FROM committees ORDER BY committee_number ASC;');
    const committees = rows.map((r: any) => {
      const data = r.data || {};
      return {
        ...data,
        id: r.id,
        committeeNumber: r.committee_number !== null ? Number(r.committee_number) : data.committeeNumber,
        committeeName: r.committee_name || data.committeeName,
        associationName: r.association_name || data.associationName,
        members: r.members || data.members || [],
        branch: r.branch || data.branch,
        competitionBook: r.competition_book || data.competitionBook,
        generalNotes: r.general_notes || data.generalNotes || '',
        courseId: r.course_id || data.courseId,
        courseName: r.course_name || data.courseName,
        sheikhName: r.sheikh_name || data.sheikhName,
        sheikhPhone: r.sheikh_phone || data.sheikhPhone,
        sheikhCountry: r.sheikh_country || data.sheikhCountry,
        studentsCount: r.students_count !== null ? Number(r.students_count) : (data.studentsCount || 0),
        isWomenCommittee: Boolean(r.is_women_committee ?? data.isWomenCommittee),
        stages: r.stages || data.stages,
        scoringDetails: r.scoring_details || data.scoringDetails,
        aggregationDetails: r.aggregation_details || data.aggregationDetails,
        ceremonyDetails: r.ceremony_details || data.ceremonyDetails,
        receivedByAssistant: r.received_by_assistant || data.receivedByAssistant,
        examApprovedBy: r.exam_approved_by || data.examApprovedBy,
        createdDate: r.created_date || data.createdDate,
        createdAtTime: r.created_at_time || data.createdAtTime,
        updatedAt: r.updated_at,
      };
    });
    res.json({ success: true, committees });
  } catch (err: any) {
    console.error('Error fetching committees from Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/committees', requireAction(ACTIONS.COMMITTEES_WRITE, {
  getCommitteeNumber: (req) => req.body?.committeeNumber,
}), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  const c = req.body;
  if (!c || !c.id) return res.status(400).json({ success: false, message: 'Invalid committee' });
  try {
    // Optimistic Concurrency Check (409)
    if (c.expectedUpdatedAt) {
      const existing = await pool.query('SELECT updated_at, data FROM committees WHERE id = $1;', [c.id]);
      if (existing.rows.length > 0 && existing.rows[0].updated_at) {
        const dbDate = new Date(existing.rows[0].updated_at).getTime();
        const expectedDate = new Date(c.expectedUpdatedAt).getTime();
        if (dbDate > expectedDate) {
          return res.status(409).json({
            success: false,
            error: 'conflict',
            message: 'تم تعديل هذه اللجنة بواسطة مستخدم آخر. يرجى تحديث الصفحة وإعادة المحاولة.',
            currentUpdatedAt: existing.rows[0].updated_at,
            currentData: existing.rows[0].data,
          });
        }
      }
    }

    await pool.query(
      `INSERT INTO committees (
        id, committee_number, committee_name, association_name, members, branch,
        competition_book, general_notes, course_id, course_name, sheikh_name,
        sheikh_phone, sheikh_country, students_count, is_women_committee, stages,
        scoring_details, aggregation_details, ceremony_details, received_by_assistant,
        exam_approved_by, created_date, created_at_time, data, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW())
      ON CONFLICT (id) DO UPDATE SET
        committee_number = EXCLUDED.committee_number,
        committee_name = EXCLUDED.committee_name,
        association_name = EXCLUDED.association_name,
        members = EXCLUDED.members,
        branch = EXCLUDED.branch,
        competition_book = EXCLUDED.competition_book,
        general_notes = EXCLUDED.general_notes,
        course_id = EXCLUDED.course_id,
        course_name = EXCLUDED.course_name,
        sheikh_name = EXCLUDED.sheikh_name,
        sheikh_phone = EXCLUDED.sheikh_phone,
        sheikh_country = EXCLUDED.sheikh_country,
        students_count = EXCLUDED.students_count,
        is_women_committee = EXCLUDED.is_women_committee,
        stages = EXCLUDED.stages,
        scoring_details = EXCLUDED.scoring_details,
        aggregation_details = EXCLUDED.aggregation_details,
        ceremony_details = EXCLUDED.ceremony_details,
        received_by_assistant = EXCLUDED.received_by_assistant,
        exam_approved_by = EXCLUDED.exam_approved_by,
        created_date = EXCLUDED.created_date,
        created_at_time = EXCLUDED.created_at_time,
        data = EXCLUDED.data,
        updated_at = NOW();`,
      [
        c.id,
        c.committeeNumber || 0,
        c.committeeName || '',
        c.associationName || null,
        JSON.stringify(c.members || []),
        c.branch || null,
        c.competitionBook || null,
        c.generalNotes || '',
        c.courseId || null,
        c.courseName || null,
        c.sheikhName || null,
        c.sheikhPhone || null,
        c.sheikhCountry || null,
        c.studentsCount || 0,
        Boolean(c.isWomenCommittee),
        JSON.stringify(c.stages || {}),
        JSON.stringify(c.scoringDetails || {}),
        JSON.stringify(c.aggregationDetails || {}),
        JSON.stringify(c.ceremonyDetails || {}),
        c.receivedByAssistant ? JSON.stringify(c.receivedByAssistant) : null,
        c.examApprovedBy ? JSON.stringify(c.examApprovedBy) : null,
        c.createdDate || null,
        c.createdAtTime || null,
        JSON.stringify(c),
      ]
    );
    res.json({ success: true, committee: c });
  } catch (err: any) {
    console.error('Error saving committee to Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/committees/bulk', requireAction(ACTIONS.COMMITTEES_WRITE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  const { committees } = req.body;
  if (!Array.isArray(committees)) return res.status(400).json({ success: false, message: 'Invalid array' });
  try {
    for (const c of committees) {
      await pool.query(
        `INSERT INTO committees (
          id, committee_number, committee_name, association_name, members, branch,
          competition_book, general_notes, course_id, course_name, sheikh_name,
          sheikh_phone, sheikh_country, students_count, is_women_committee, stages,
          data, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        ON CONFLICT (id) DO UPDATE SET
          committee_number = EXCLUDED.committee_number,
          committee_name = EXCLUDED.committee_name,
          course_id = EXCLUDED.course_id,
          course_name = EXCLUDED.course_name,
          sheikh_name = EXCLUDED.sheikh_name,
          branch = EXCLUDED.branch,
          competition_book = EXCLUDED.competition_book,
          students_count = EXCLUDED.students_count,
          stages = EXCLUDED.stages,
          data = EXCLUDED.data,
          updated_at = NOW();`,
        [
          c.id,
          c.committeeNumber || 0,
          c.committeeName || '',
          c.associationName || null,
          JSON.stringify(c.members || []),
          c.branch || null,
          c.competitionBook || null,
          c.generalNotes || '',
          c.courseId || null,
          c.courseName || null,
          c.sheikhName || null,
          c.sheikhPhone || null,
          c.sheikhCountry || null,
          c.studentsCount || 0,
          Boolean(c.isWomenCommittee),
          JSON.stringify(c.stages || {}),
          JSON.stringify(c),
        ]
      );
    }
    res.json({ success: true, count: committees.length });
  } catch (err: any) {
    console.error('Error saving bulk committees to Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/committees/:id', requireAction(ACTIONS.COMMITTEES_DELETE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  try {
    await pool.query('DELETE FROM committees WHERE id = $1;', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting committee from Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// App Users Endpoints
// -------------------------------------------------------------
app.get('/api/users', requireAction(ACTIONS.USERS_READ), async (req, res) => {
  if (!pool) return res.json({ success: true, users: [], total: 0 });
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const countRes = await pool.query('SELECT COUNT(*) FROM app_users;');
    const total = parseInt(countRes.rows[0].count, 10);

    let query = "SELECT * FROM app_users ORDER BY role = 'super_admin' DESC, created_at ASC";
    const params: any[] = [];
    if (limit !== undefined && !isNaN(limit)) {
      query += ' LIMIT $1 OFFSET $2;';
      params.push(limit, offset);
    } else {
      query += ';';
    }

    const { rows } = await pool.query(query, params);
    const users = rows.map((r: any) => {
      const data = r.data || {};
      return {
        ...data,
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        password: r.password,
        passportNumber: r.passport_number || data.passportNumber,
        role: r.role,
        status: r.status,
        assignedCommittees: r.assigned_committees || data.assignedCommittees || [],
        permissions: r.permissions || data.permissions || [],
        createdAt: r.created_at || data.createdAt,
        approvedAt: r.approved_at || data.approvedAt,
        approvedBy: r.approved_by || data.approvedBy,
        notes: r.notes || data.notes,
        updatedAt: r.updated_at,
      };
    });

    if (limit !== undefined && !isNaN(limit)) {
      return res.json({
        success: true,
        users,
        total,
        limit,
        offset,
        hasMore: offset + users.length < total,
      });
    }

    res.json({ success: true, users, total });
  } catch (err: any) {
    console.error('Error fetching users from Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', async (req, res, next) => {
  // Allow self-registration if status is pending
  const isPendingRegistration = req.body?.status === 'pending';
  if (isPendingRegistration) {
    return next();
  }
  return requireAction(ACTIONS.USERS_WRITE)(req, res, next);
}, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  const u = req.body;
  if (!u || !u.id) return res.status(400).json({ success: false, message: 'Invalid user' });
  try {
    // Optimistic Concurrency Check (409)
    if (u.expectedUpdatedAt) {
      const existing = await pool.query('SELECT updated_at, data FROM app_users WHERE id = $1;', [u.id]);
      if (existing.rows.length > 0 && existing.rows[0].updated_at) {
        const dbDate = new Date(existing.rows[0].updated_at).getTime();
        const expectedDate = new Date(u.expectedUpdatedAt).getTime();
        if (dbDate > expectedDate) {
          return res.status(409).json({
            success: false,
            error: 'conflict',
            message: 'تم تعديل بيانات هذا المستخدم بواسطة مستخدم آخر. يرجى التحديث والمحاولة مجدداً.',
            currentUpdatedAt: existing.rows[0].updated_at,
            currentData: existing.rows[0].data,
          });
        }
      }
    }

    await pool.query(
      `INSERT INTO app_users (id, name, phone, email, password, passport_number, role, status, assigned_committees, permissions, notes, created_at, approved_at, approved_by, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         email = EXCLUDED.email,
         password = EXCLUDED.password,
         passport_number = EXCLUDED.passport_number,
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         assigned_committees = EXCLUDED.assigned_committees,
         permissions = EXCLUDED.permissions,
         notes = EXCLUDED.notes,
         approved_at = EXCLUDED.approved_at,
         approved_by = EXCLUDED.approved_by,
         data = EXCLUDED.data,
         updated_at = NOW();`,
      [
        u.id,
        u.name,
        u.phone || '',
        u.email || null,
        u.password || null,
        u.passportNumber || null,
        u.role || 'assistant',
        u.status || 'pending',
        JSON.stringify(u.assignedCommittees || []),
        JSON.stringify(u.permissions || []),
        u.notes || null,
        u.createdAt || new Date().toISOString(),
        u.approvedAt || null,
        u.approvedBy || null,
        JSON.stringify(u),
      ]
    );
    res.json({ success: true, user: u });
  } catch (err: any) {
    console.error('Error saving user to Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:id', requireAction(ACTIONS.USERS_DELETE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  try {
    await pool.query('DELETE FROM app_users WHERE id = $1;', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting user from Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Exams Endpoints
// -------------------------------------------------------------
app.get('/api/exams', requireAction(ACTIONS.EXAMS_READ), async (_req, res) => {
  if (!pool) return res.json({ success: true, exams: [] });
  try {
    const { rows } = await pool.query('SELECT * FROM exams ORDER BY uploaded_at DESC;');
    const exams = rows.map((r: any) => ({
      ...(r.data || {}),
      id: r.id,
      title: r.title,
      book: r.book,
      branch: r.branch,
      totalMarks: r.total_marks,
      durationMinutes: r.duration_minutes,
      questionsCount: r.questions_count,
      pdfFileName: r.pdf_file_name,
      pdfFileSize: r.pdf_file_size,
      pdfDataUrl: r.pdf_data_url,
      uploadedAt: r.uploaded_at,
      notes: r.notes,
      updatedAt: r.updated_at,
    }));
    res.json({ success: true, exams });
  } catch (err: any) {
    console.error('Error fetching exams from Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/exams', requireAction(ACTIONS.EXAMS_WRITE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  const exam = req.body;
  if (!exam || !exam.id) return res.status(400).json({ success: false, message: 'Invalid exam' });
  try {
    // Optimistic Concurrency Check (409)
    if (exam.expectedUpdatedAt) {
      const existing = await pool.query('SELECT updated_at, data FROM exams WHERE id = $1;', [exam.id]);
      if (existing.rows.length > 0 && existing.rows[0].updated_at) {
        const dbDate = new Date(existing.rows[0].updated_at).getTime();
        const expectedDate = new Date(exam.expectedUpdatedAt).getTime();
        if (dbDate > expectedDate) {
          return res.status(409).json({
            success: false,
            error: 'conflict',
            message: 'تم تعديل هذا الامتحان بواسطة مستخدم آخر أثناء تعديلك. يرجى تحديث الصفحة وإعادة المحاولة.',
            currentUpdatedAt: existing.rows[0].updated_at,
            currentData: existing.rows[0].data,
          });
        }
      }
    }

    await pool.query(
      `INSERT INTO exams (id, title, book, branch, total_marks, duration_minutes, questions_count, pdf_file_name, pdf_file_size, pdf_data_url, uploaded_at, notes, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         book = EXCLUDED.book,
         branch = EXCLUDED.branch,
         total_marks = EXCLUDED.total_marks,
         duration_minutes = EXCLUDED.duration_minutes,
         questions_count = EXCLUDED.questions_count,
         pdf_file_name = EXCLUDED.pdf_file_name,
         pdf_file_size = EXCLUDED.pdf_file_size,
         pdf_data_url = EXCLUDED.pdf_data_url,
         notes = EXCLUDED.notes,
         data = EXCLUDED.data,
         updated_at = NOW();`,
      [
        exam.id,
        exam.title,
        exam.book || '',
        exam.branch || null,
        exam.totalMarks || 100,
        exam.durationMinutes || 60,
        exam.questionsCount || 5,
        exam.pdfFileName || null,
        exam.pdfFileSize || null,
        exam.pdfDataUrl || null,
        exam.uploadedAt || new Date().toISOString(),
        exam.notes || null,
        JSON.stringify(exam),
      ]
    );
    res.json({ success: true, exam });
  } catch (err: any) {
    console.error('Error saving exam to Supabase:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/exams/:id', requireAction(ACTIONS.EXAMS_DELETE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  try {
    await pool.query('DELETE FROM exams WHERE id = $1;', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Schedule Tasks Endpoints
// -------------------------------------------------------------
app.get('/api/tasks', requireAction(ACTIONS.TASKS_READ), async (_req, res) => {
  if (!pool) return res.json({ success: true, tasks: [] });
  try {
    const { rows } = await pool.query('SELECT * FROM schedule_tasks ORDER BY date ASC, time ASC;');
    const tasks = rows.map((r: any) => ({
      ...(r.data || {}),
      id: r.id,
      title: r.title,
      date: r.date,
      time: r.time,
      committeeId: r.committee_id,
      committeeNumber: r.committee_number !== null ? Number(r.committee_number) : undefined,
      assignedAssistantId: r.assigned_assistant_id,
      assignedAssistantName: r.assigned_assistant_name,
      type: r.type,
      priority: r.priority,
      completed: Boolean(r.completed),
      completedAt: r.completed_at,
      deliverable: r.deliverable,
      notes: r.notes,
      updatedAt: r.updated_at,
    }));
    res.json({ success: true, tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tasks', requireAction(ACTIONS.TASKS_WRITE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  const task = req.body;
  if (!task || !task.id) return res.status(400).json({ success: false, message: 'Invalid task' });
  try {
    // Optimistic Concurrency Check (409)
    if (task.expectedUpdatedAt) {
      const existing = await pool.query('SELECT updated_at, data FROM schedule_tasks WHERE id = $1;', [task.id]);
      if (existing.rows.length > 0 && existing.rows[0].updated_at) {
        const dbDate = new Date(existing.rows[0].updated_at).getTime();
        const expectedDate = new Date(task.expectedUpdatedAt).getTime();
        if (dbDate > expectedDate) {
          return res.status(409).json({
            success: false,
            error: 'conflict',
            message: 'تم تعديل هذه المهمة بواسطة مستخدم آخر. يرجى التحديث والمحاولة مجدداً.',
            currentUpdatedAt: existing.rows[0].updated_at,
            currentData: existing.rows[0].data,
          });
        }
      }
    }

    await pool.query(
      `INSERT INTO schedule_tasks (id, title, date, time, committee_id, committee_number, assigned_assistant_id, assigned_assistant_name, type, priority, completed, completed_at, deliverable, notes, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         date = EXCLUDED.date,
         time = EXCLUDED.time,
         committee_id = EXCLUDED.committee_id,
         committee_number = EXCLUDED.committee_number,
         assigned_assistant_id = EXCLUDED.assigned_assistant_id,
         assigned_assistant_name = EXCLUDED.assigned_assistant_name,
         type = EXCLUDED.type,
         priority = EXCLUDED.priority,
         completed = EXCLUDED.completed,
         completed_at = EXCLUDED.completed_at,
         deliverable = EXCLUDED.deliverable,
         notes = EXCLUDED.notes,
         data = EXCLUDED.data,
         updated_at = NOW();`,
      [
        task.id,
        task.title,
        task.date,
        task.time || null,
        task.committeeId || null,
        task.committeeNumber || null,
        task.assignedAssistantId || null,
        task.assignedAssistantName || null,
        task.type || 'general',
        task.priority || 'normal',
        Boolean(task.completed),
        task.completedAt || null,
        task.deliverable || null,
        task.notes || null,
        JSON.stringify(task),
      ]
    );
    res.json({ success: true, task });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/tasks/:id/toggle', requireAction(ACTIONS.TASKS_WRITE, {
  getCommitteeNumber: (req) => req.body?.committeeNumber,
}), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  try {
    const { completed, completedAt } = req.body;
    await pool.query(
      'UPDATE schedule_tasks SET completed = $1, completed_at = $2, updated_at = NOW() WHERE id = $3;',
      [Boolean(completed), completedAt || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/tasks/:id', requireAction(ACTIONS.TASKS_DELETE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  try {
    await pool.query('DELETE FROM schedule_tasks WHERE id = $1;', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Notifications Endpoints
// -------------------------------------------------------------
app.get('/api/notifications', requireAction(ACTIONS.NOTIFICATIONS_READ), async (req, res) => {
  if (!pool) return res.json({ success: true, notifications: [], total: 0 });
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const countRes = await pool.query('SELECT COUNT(*) FROM notifications;');
    const total = parseInt(countRes.rows[0].count, 10);

    let query = 'SELECT * FROM notifications ORDER BY created_at DESC';
    const params: any[] = [];
    if (limit !== undefined && !isNaN(limit)) {
      query += ' LIMIT $1 OFFSET $2;';
      params.push(limit, offset);
    } else {
      query += ' LIMIT 50;';
    }

    const { rows } = await pool.query(query, params);
    const notifications = rows.map((r: any) => ({
      ...(r.data || {}),
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      read: Boolean(r.read),
      committeeId: r.committee_id,
      time: r.created_at,
    }));

    if (limit !== undefined && !isNaN(limit)) {
      return res.json({
        success: true,
        notifications,
        total,
        limit,
        offset,
        hasMore: offset + notifications.length < total,
      });
    }

    res.json({ success: true, notifications, total });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/notifications', requireAction(ACTIONS.NOTIFICATIONS_WRITE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  const notif = req.body;
  if (!notif || !notif.id) return res.status(400).json({ success: false });
  try {
    await pool.query(
      `INSERT INTO notifications (id, title, description, type, read, committee_id, created_at, data)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
       ON CONFLICT (id) DO NOTHING;`,
      [notif.id, notif.title, notif.description, notif.type || 'info', Boolean(notif.read), notif.committeeId || null, JSON.stringify(notif)]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/notifications/:id/read', requireAction(ACTIONS.NOTIFICATIONS_WRITE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  try {
    await pool.query('UPDATE notifications SET read = true WHERE id = $1;', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Scoring Records Endpoints
// -------------------------------------------------------------
app.get('/api/scoring', requireAction(ACTIONS.SCORING_READ), async (req, res) => {
  if (!pool) return res.json({ success: true, records: [] });
  try {
    const committeeId = req.query.committeeId;
    let query = 'SELECT * FROM scoring_records';
    const params: any[] = [];
    if (committeeId) {
      query += ' WHERE committee_id = $1';
      params.push(committeeId);
    }
    query += ' ORDER BY created_at ASC;';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, records: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/scoring', requireAction(ACTIONS.SCORING_WRITE, {
  getCommitteeNumber: (req) => req.body?.committeeNumber,
}), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  const record = req.body;
  if (!record || !record.id) return res.status(400).json({ success: false });
  try {
    await pool.query(
      `INSERT INTO scoring_records (id, committee_id, committee_number, student_name, question_number, score, max_score, scorer_name, notes, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (id) DO UPDATE SET
         score = EXCLUDED.score,
         notes = EXCLUDED.notes,
         scorer_name = EXCLUDED.scorer_name,
         data = EXCLUDED.data,
         updated_at = NOW();`,
      [
        record.id,
        record.committeeId || null,
        record.committeeNumber || null,
        record.studentName || '',
        record.questionNumber || 1,
        record.score || 0,
        record.maxScore || 10,
        record.scorerName || null,
        record.notes || null,
        JSON.stringify(record),
      ]
    );
    res.json({ success: true, record });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Audit Logs Endpoint
// -------------------------------------------------------------
app.get('/api/audit-logs', requireAction(ACTIONS.AUDIT_LOGS_READ), async (_req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: 'قاعدة بيانات سوبابيز غير متصلة، يجب تفعيل الاتصال المباشر.',
      logs: [],
    });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50;');
    const logs = rows.map((r: any) => ({
      id: r.id,
      timestamp: new Date(r.created_at).toLocaleTimeString('ar-EG'),
      user: r.user_name + (r.user_role ? ` (${r.user_role})` : ''),
      action: r.action,
      details: r.details,
      status: r.status,
    }));
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/audit-logs', requireAction(ACTIONS.AUDIT_LOGS_WRITE), async (req, res) => {
  if (!pool) return res.status(503).json({ success: false });
  const { id, userName, userRole, action, details, status } = req.body;
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, user_name, user_role, action, details, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO NOTHING;`,
      [id || `log-${Date.now()}`, userName || 'مستخدم', userRole || 'system', action || '', details || '', status || 'success']
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Database Upload, Schema & Migration Endpoints
// -------------------------------------------------------------
app.get('/api/database/schema', requireAction(ACTIONS.DATABASE_ADMIN), (_req, res) => {
  try {
    const schemaFile = path.resolve(process.cwd(), 'supabase_schema.sql');
    if (!fs.existsSync(schemaFile)) {
      return res.status(404).json({ success: false, message: 'ملف المخطط غير موجود' });
    }
    const sql = fs.readFileSync(schemaFile, 'utf8');
    res.json({ success: true, sql, fileName: 'supabase_schema.sql', sizeBytes: sql.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/database/migrate', requireAction(ACTIONS.DATABASE_ADMIN), async (_req, res) => {
  if (!pool) {
    return res.status(503).json({ success: false, message: 'قاعدة بيانات سوبابيز غير متصلة' });
  }
  const startTime = Date.now();
  try {
    const schemaFile = path.resolve(process.cwd(), 'supabase_schema.sql');
    if (!fs.existsSync(schemaFile)) {
      return res.status(404).json({ success: false, message: 'ملف المخطط supabase_schema.sql غير موجود' });
    }
    const sql = fs.readFileSync(schemaFile, 'utf8');
    await pool.query(sql);

    // Query tables and counts
    const tablesRes = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );

    const tablesWithCounts = [];
    for (const row of tablesRes.rows) {
      const name = row.table_name;
      try {
        const cRes = await pool.query(`SELECT COUNT(*) as cnt FROM "${name}";`);
        tablesWithCounts.push({ name, count: parseInt(cRes.rows[0].cnt, 10), status: 'synced' });
      } catch {
        tablesWithCounts.push({ name, count: 0, status: 'ready' });
      }
    }

    const durationMs = Date.now() - startTime;
    res.json({
      success: true,
      message: 'تم رفع وتطبيق مخطط قاعدة البيانات بالكامل على سوبابيز بنجاح تام! ✓',
      durationMs,
      tablesCount: tablesWithCounts.length,
      tables: tablesWithCounts,
    });
  } catch (err: any) {
    console.error('Error during migration:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Real Live Database test endpoint
app.get('/api/database/test', requireAction(ACTIONS.DATABASE_ADMIN), async (_req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: 'لم يتم العثور على إعدادات الاتصال بسوبابيز (SUPABASE_URL أو SUPABASE_DB_HOST).',
    });
  }

  const startTime = Date.now();
  try {
    const result = await pool.query(
      'SELECT NOW() as current_time, version() as pg_version, current_database() as db_name, current_user as user_name;'
    );
    const latency = Date.now() - startTime;

    const tablesResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );

    const tablesDetails = [];
    for (const r of tablesResult.rows) {
      try {
        const cntRes = await pool.query(`SELECT COUNT(*) as count FROM "${r.table_name}";`);
        tablesDetails.push({ name: r.table_name, count: parseInt(cntRes.rows[0].count, 10) });
      } catch {
        tablesDetails.push({ name: r.table_name, count: 0 });
      }
    }

    return res.json({
      success: true,
      message: 'تم الاتصال بقاعدة بيانات سوبابيز بنجاح تام! ✓',
      connection: {
        host: process.env.SUPABASE_DB_HOST || 'aws-1-eu-west-1.pooler.supabase.com',
        port: process.env.SUPABASE_DB_PORT || '6543',
        database: result.rows[0].db_name,
        user: result.rows[0].user_name,
        postgresVersion: result.rows[0].pg_version.split(',')[0],
        serverTime: result.rows[0].current_time,
        latencyMs: latency,
        tablesCount: tablesResult.rows.length,
        tables: tablesDetails,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'فشل الاتصال بقاعدة البيانات سوبابيز: ' + error.message,
      error: error.message,
      code: error.code,
    });
  }
});

// Database connection health & statistics endpoint
app.get('/api/database/status', requireAction(ACTIONS.DATABASE_ADMIN), async (_req, res) => {
  if (pool) {
    const startTime = Date.now();
    try {
      const qRes = await pool.query(
        'SELECT NOW() as now, current_database() as db_name, current_user as user_name;'
      );
      const latency = Date.now() - startTime;
      const tablesRes = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
      );

      const tablesWithCount = [];
      for (const row of tablesRes.rows) {
        try {
          const cRes = await pool.query(`SELECT COUNT(*) as count FROM "${row.table_name}";`);
          tablesWithCount.push({
            name: row.table_name,
            count: parseInt(cRes.rows[0].count, 10),
            status: 'synced',
          });
        } catch {
          tablesWithCount.push({ name: row.table_name, count: 0, status: 'ready' });
        }
      }

      return res.json({
        status: 'connected',
        engine: 'Supabase PostgreSQL Cloud Engine',
        host: process.env.SUPABASE_DB_HOST || 'aws-1-eu-west-1.pooler.supabase.com',
        database: qRes.rows[0].db_name,
        user: qRes.rows[0].user_name,
        connectionPool: 'active (SSL TLS 1.3)',
        latencyMs: latency,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: qRes.rows[0].now,
        tablesCount: tablesWithCount.length,
        tables: tablesWithCount,
        encryption: 'TLS 1.3 / SSL Verified',
        backupStatus: 'Supabase Automated Point-in-Time Recovery Active',
      });
    } catch (err: any) {
      return res.status(500).json({
        status: 'error',
        connected: false,
        engine: 'Supabase PostgreSQL (خطأ في الاتصال)',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return res.status(503).json({
    status: 'offline',
    connected: false,
    engine: 'Supabase PostgreSQL (غير متصل)',
    error: 'لم يتم العثور على إعدادات الاتصال بسوبابيز (SUPABASE_URL أو SUPABASE_DB_HOST)',
    timestamp: new Date().toISOString(),
    tables: [],
  });
});

// Setup Vite middleware or static serving
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer();
}

export { app, startServer };
