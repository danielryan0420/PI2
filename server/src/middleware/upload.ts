import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const IMPORT_DIR = path.join(__dirname, '..', 'uploads', 'imports');
if (!fs.existsSync(IMPORT_DIR)) fs.mkdirSync(IMPORT_DIR, { recursive: true });

export const photoUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

export const importUpload = multer({
  storage: multer.diskStorage({
    destination: IMPORT_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for large SAP exports
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only CSV or XLSX files are allowed'));
  },
});

export const UPLOADS_DIR_PATH = UPLOADS_DIR;
