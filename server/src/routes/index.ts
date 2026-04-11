import { Express } from 'express';
import usersRouter from './users';
import materialsRouter from './materials';
import sessionsRouter from './sessions';
import countsRouter from './counts';
import photosRouter from './photos';
import messagesRouter from './messages';
import configRouter from './config';
import importsRouter from './imports';
import exportsRouter from './exports';
import dashboardRouter from './dashboard';
import wmBinsRouter from './wmBins';

export function registerRoutes(app: Express) {
  app.use('/api/users', usersRouter);
  app.use('/api', materialsRouter);
  app.use('/api', sessionsRouter);
  app.use('/api', countsRouter);
  app.use('/api', photosRouter);
  app.use('/api', messagesRouter);
  app.use('/api', configRouter);
  app.use('/api', importsRouter);
  app.use('/api', exportsRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', wmBinsRouter);
}
