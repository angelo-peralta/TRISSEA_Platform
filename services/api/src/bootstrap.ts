import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

export async function createApp() {
  // No HTTP/request-body logger: bearer tokens, phones and coordinates must not leak.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false,bodyLimit:16*1024,trustProxy:false }), { logger: false, abortOnError: false });
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  await app.init();
  return app;
}
