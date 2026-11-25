import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';

async function start() {
  const app = createApp();
  const connection = await connectDatabase(env.MONGODB_URI);
  console.log(`MongoDB connected (database: ${connection.name})`);

  const server = app.listen(env.PORT, (error) => {
    if (error) throw error;
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Could not start the server:', error.message);
  process.exit(1);
});
