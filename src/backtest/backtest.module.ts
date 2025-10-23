import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';
import { BacktestProgressGateway } from './backtest-progress.gateway';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [BacktestController],
  providers: [BacktestService, BacktestProgressGateway, WsJwtGuard],
  exports: [BacktestService],
})
export class BacktestModule {}
