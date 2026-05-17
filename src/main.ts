import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow the React client dev-server to talk to this API
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // strip properties not declared in the DTO
      forbidNonWhitelisted: true, // throw 400 if extra properties are sent
      transform: true,            // auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // "5" -> 5, "true" -> true, etc.
      },
    }),
  );
  
  // Swagger setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TaskFlow API')
    .setDescription('Collaborative task & scheduling platform')
    .setVersion('0.1.0')
    .addBearerAuth()  // for JWT later
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  await app.listen(port);
  console.log(`🚀 TaskFlow API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
  
}
bootstrap();
