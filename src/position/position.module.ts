import { Module } from '@nestjs/common';
import { PositionController } from './position.controller';
import { PositionService } from './position.service';
import { PrismaModule } from '../prisma/prisma.module';
import { GraphQLModule } from '../graphql/graphql.module';

@Module({
  imports: [PrismaModule, GraphQLModule],
  controllers: [PositionController],
  providers: [PositionService],
  exports: [PositionService],
})
export class PositionModule {}
