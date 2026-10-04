
import 'dotenv/config';
import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { User, Project, Client, Worker, Attendance, Payment, SiteUpdate, Timeline } from './models/index.js';

dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '3mb' }));
const root = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.VERCEL ? path.join('/tmp', 'siteledger-uploads') : path.join(root, '../uploads'); fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));
if (process.env.VERCEL) app.use('/api/uploads', express.static(uploadDir));
const upload = multer({ dest: uploadDir, limits: { fileSize: 8 * 1024 * 1024 } });

app.post('/api/auth/register', async (req, res) => {
  try { const { name, email, password } = req.body; if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: 'Name, email and an 8 character password are required.' });
    const exists = await User.findOne({ email }); if (exists) return res.status(409).json({ message: 'An account with this email already exists.' });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12) }); res.status(201).json(authPayload(user));
  } catch (e) { res.status(400).json({ message: e.message }); }
});
app.post('/api/auth/login', async (req, res) => { const user = await User.findOne({ email: req.body.email }); if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Email or password is incorrect.' }); res.json(authPayload(user)); });
function authPayload(user) { return { token: jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' }), user: { id: user.id, name: user.name, email: user.email } }; }
app.use('/api', (req, res, next) => { if (req.path.startsWith('/auth/')) return next(); const header = req.headers.authorization || ''; try { req.userId = jwt.verify(header.replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET).id; next(); } catch { res.status(401).json({ message: 'Please sign in to continue.' }); } });
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const own = (Model, id, owner) => Model.findOne({ _id: id, owner });
const cleanRefs = body => { const value = { ...body }; for (const key of ['project','worker','client']) if (value[key] === '') delete value[key]; return value; };
const crud = (route, Model, populate = '') => {
  app.get(`/api/${route}`, asyncRoute(async (req,res) => { const q = Model.find({ owner: req.userId }).sort({ createdAt: -1 }); if (populate) q.populate(populate); res.json(await q); }));
  app.post(`/api/${route}`, asyncRoute(async (req,res) => { const doc = await Model.create({ ...cleanRefs(req.body), owner: req.userId }); res.status(201).json(doc); }));
  app.put(`/api/${route}/:id`, asyncRoute(async (req,res) => { const doc = await Model.findOneAndUpdate({ _id: req.params.id, owner: req.userId }, cleanRefs(req.body), { new: true, runValidators: true }); if (!doc) return res.status(404).json({ message: 'Record not found.' }); res.json(doc); }));
  app.delete(`/api/${route}/:id`, asyncRoute(async (req,res) => { const doc = await Model.findOneAndDelete({ _id: req.params.id, owner: req.userId }); if (!doc) return res.status(404).json({ message: 'Record not found.' }); res.json({ ok: true }); }));
};
crud('projects', Project); crud('clients', Client, 'project'); crud('workers', Worker, 'project'); crud('payments', Payment, 'worker client project'); crud('site-updates', SiteUpdate, 'project'); crud('timeline', Timeline, 'project');

app.get('/api/dashboard', asyncRoute(async (req,res) => {
  const owner = req.userId; const today = new Date(); today.setHours(0,0,0,0); const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const [projects, workers, todays, payments, updates, clients] = await Promise.all([Project.find({ owner }), Worker.find({ owner }), Attendance.find({ owner, date: { $gte: today, $lt: tomorrow } }).populate('worker'), Payment.find({ owner }), SiteUpdate.find({ owner }).sort({ date: -1 }).limit(5).populate('project'), Client.find({ owner })]);
  const activeProjects = projects.filter(p => p.status === 'Ongoing'); const present = todays.filter(a => ['Present','Half Day'].includes(a.status)).length;
  const [year, month] = [today.getFullYear(), today.getMonth()]; const monthStart = new Date(year, month, 1); const monthAttendance = await Attendance.find({ owner, date: { $gte: monthStart, $lt: tomorrow } });
  const earned = workers.filter(w=>w.status==='Active').reduce((total, w) => { const rows = monthAttendance.filter(a => a.worker.toString() === w.id); return total + rows.filter(a=>a.status==='Present').length*w.dailyRate + rows.filter(a=>a.status==='Half Day').length*w.dailyRate/2; }, 0);
  const paidThisMonth = payments.filter(p => new Date(p.date) >= monthStart).reduce((sum,p)=>sum+p.amount,0);
  const clientContracts = clients.reduce((s,c) => s + (c.contractAmount || 0), 0);
  const clientPaid = payments.filter(p => p.client).reduce((s,p) => s + p.amount, 0);
  const monthlyAttendance = await Attendance.aggregate([{ $match: { owner: new mongoose.Types.ObjectId(owner), date: { $gte: new Date(today.getFullYear(), today.getMonth()-5, 1), $lt: tomorrow } } }, { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' }, status: '$status' }, count: { $sum: 1 } } }, { $sort: { '_id.year': 1, '_id.month': 1 } }]);
  res.json({ totalProjects: projects.length, activeProjects: activeProjects.length, completedProjects: projects.filter(p=>p.status==='Completed').length, clients: clients.length, workers: workers.length, present, absent: todays.filter(a=>a.status==='Absent').length, pendingPayments: Math.max(0,earned-paidThisMonth), pendingClientPayments: Math.max(0,clientContracts-clientPaid), totalPayments: payments.reduce((s,p)=>s+p.amount,0), overallProgress: projects.length ? Math.round(projects.reduce((s,p)=>s+(p.progress||0),0)/projects.length) : 0, monthlyAttendance, projects: projects.slice(0,5), updates });
}));

app.get('/api/attendance', asyncRoute(async (req,res) => { const q = { owner: req.userId }; if (req.query.project) q.project = req.query.project; if (req.query.worker) q.worker = req.query.worker; if (req.query.from || req.query.to) q.date = {}; if (req.query.from) q.date.$gte = new Date(req.query.from); if (req.query.to) q.date.$lte = new Date(`${req.query.to}T23:59:59`); res.json(await Attendance.find(q).populate('worker project').sort({ date: -1 })); }));
app.post('/api/attendance/bulk', asyncRoute(async (req,res) => { const { date, records } = req.body; if (!date || !Array.isArray(records)) return res.status(400).json({ message: 'Date and attendance records are required.' }); const day = new Date(`${date}T00:00:00`); let saved=0; for (const r of records) { const worker = await own(Worker, r.worker, req.userId); if (!worker) continue; await Attendance.findOneAndUpdate({ owner:req.userId, worker:r.worker, date:day }, { owner:req.userId, worker:r.worker, project:worker.project, date:day, status:r.status }, { upsert:true, new:true, runValidators:true, setDefaultsOnInsert:true }); saved++; } res.json({ saved }); }));
app.put('/api/attendance/:id', asyncRoute(async (req,res) => { const row=await Attendance.findOneAndUpdate({ _id:req.params.id, owner:req.userId }, { status:req.body.status }, { new:true, runValidators:true }).populate('worker project'); if(!row) return res.status(404).json({message:'Attendance record not found.'}); res.json(row); }));
app.get('/api/payroll', asyncRoute(async (req,res) => { const { month, project } = req.query; const [y,m] = (month || new Date().toISOString().slice(0,7)).split('-').map(Number); const from = new Date(y,m-1,1), to = new Date(y,m,1); const wq = { owner:req.userId, status:'Active' }; if(project) wq.project=project; const workers=await Worker.find(wq).populate('project'); const attend=await Attendance.find({ owner:req.userId, date:{ $gte:from,$lt:to } }); const paid=await Payment.aggregate([{ $match:{ owner:new mongoose.Types.ObjectId(req.userId), date:{ $gte:from,$lt:to }, worker:{ $ne:null } } },{ $group:{ _id:'$worker', amount:{ $sum:'$amount' } } }]); const paidMap=Object.fromEntries(paid.map(x=>[x._id.toString(),x.amount])); res.json(workers.map(w=>{ const rows=attend.filter(a=>a.worker.toString()===w.id); const count=status=>rows.filter(a=>a.status===status).length; const present=count('Present'), half=count('Half Day'), absent=count('Absent'), leave=count('Leave'); const earned=present*w.dailyRate+half*w.dailyRate/2; const paidAmount=paidMap[w.id]||0; return { worker:w, presentDays:present, halfDays:half, absentDays:absent, leaveDays:leave, earned, paid:paidAmount, remaining:Math.max(0,earned-paidAmount) }; })); }));
app.post('/api/site-updates/:id/photos', upload.array('photos', 12), asyncRoute(async (req,res) => { const doc=await own(SiteUpdate,req.params.id,req.userId); if(!doc) return res.status(404).json({message:'Update not found.'}); doc.photos.push(...req.files.map(f=>`/uploads/${f.filename}`)); await doc.save(); res.json(doc); }));
app.get('/api/reports/:type.csv', asyncRoute(async (req,res) => {
  const owner=req.userId, { type }=req.params, { project, worker, client, month, from, to }=req.query;
  const dateQuery={}; if(month){const [y,m]=month.split('-').map(Number);dateQuery.$gte=new Date(y,m-1,1);dateQuery.$lt=new Date(y,m,1)}else{if(from)dateQuery.$gte=new Date(`${from}T00:00:00`);if(to)dateQuery.$lt=new Date(new Date(`${to}T00:00:00`).getTime()+86400000)}
  const dateFilter=Object.keys(dateQuery).length?{date:dateQuery}:{}; let rows=[];
  if(type==='attendance'){
    const q={owner,...dateFilter};if(project)q.project=project;if(worker)q.worker=worker;
    const docs=await Attendance.find(q).populate('worker project');rows=docs.map(x=>({Date:x.date,Worker:x.worker?.name,Project:x.project?.name,Status:x.status}));
  } else if(type==='client-payments'){
    const q={owner,client:{$ne:null},...dateFilter};if(project)q.project=project;if(client)q.client=client;
    const docs=await Payment.find(q).populate('client project');rows=docs.map(x=>({Date:x.date,Client:x.client?.name,Project:x.project?.name,Method:x.method,TransactionID:x.transactionId,Notes:x.remarks,Amount:x.amount}));
  } else if(type==='worker-payments'||type==='project-expenses'){
    const q={owner,worker:{$ne:null},...dateFilter};if(project)q.project=project;if(worker)q.worker=worker;
    const docs=await Payment.find(q).populate('worker project');rows=docs.map(x=>({Date:x.date,Worker:x.worker?.name,Project:x.project?.name,Method:x.method,TransactionID:x.transactionId,Notes:x.remarks,Amount:x.amount}));
  } else if(type==='project-progress'){
    const q={owner};if(project)q._id=project;const docs=await Project.find(q);rows=docs.map(x=>({Project:x.name,Client:x.clientName,Type:x.type,Location:x.location,Status:x.status,ProgressPercent:x.progress,Budget:x.budget,StartDate:x.startDate,ExpectedCompletion:x.dueDate,Description:x.description,Notes:x.notes}));
  } else if(type==='projects'){
    const q={owner};if(project)q._id=project;const docs=await Project.find(q);rows=docs.map(x=>({Project:x.name,Client:x.clientName,Type:x.type,Location:x.location,Status:x.status,ProgressPercent:x.progress,Budget:x.budget}));
  } else return res.status(404).json({message:'Report type not found.'});
  const keys=rows.length?Object.keys(rows[0]):[];const esc=v=>`"${String(v instanceof Date?v.toISOString().slice(0,10):v??'').replaceAll('"','""')}"`;res.type('text/csv').attachment(`${type}.csv`).send([keys.join(','),...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n'));
}));
app.get('/api/health', (req,res)=>res.json({ ok:true }));
app.use((err,req,res,next)=>{ console.error(err); res.status(err.status || 400).json({ message: err.message || 'Something went wrong.' }); });
let databaseConnection;
export function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (!process.env.MONGODB_URI) return Promise.reject(new Error('MONGODB_URI is not configured.'));
  if (!databaseConnection) databaseConnection = mongoose.connect(process.env.MONGODB_URI).catch(error => { databaseConnection = null; throw error; });
  return databaseConnection;
}

export { app };

if (!process.env.VERCEL) {
  const port=process.env.PORT||4000;
  connectDatabase().then(()=>app.listen(port,()=>console.log(`SiteLedger API listening on ${port}`))).catch(e=>{ console.error('MongoDB connection failed:',e.message); process.exit(1); });
}
