import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri) {
  console.time('MongoDB: Total');

  try {
    console.time('MongoDB: Connect');

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
    });

    console.timeEnd('MongoDB: Connect');

    console.time('MongoDB: Model Initialization');

    await Promise.all(
      Object.values(mongoose.models).map((model) => model.init())
    );

    console.timeEnd('MongoDB: Model Initialization');

    console.timeEnd('MongoDB: Total');

    return mongoose.connection;
  } catch (error) {
    console.timeEnd('MongoDB: Total');
    throw error;
  }
}

export function disconnectDatabase() {
  return mongoose.disconnect();
}
