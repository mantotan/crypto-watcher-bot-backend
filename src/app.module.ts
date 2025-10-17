import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { GraphQLModule } from './graphql/graphql.module';
import { AuthModule } from './auth/auth.module';
import { BacktestModule } from './backtest/backtest.module';
import { TradingAccountModule } from './trading-account/trading-account.module';
import { StrategyModule } from './strategy/strategy.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PositionModule } from './position/position.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 60 seconds
        limit: 60, // 60 requests per minute (reasonable default for most operations)
      },
    ]),
    PrismaModule,
    RedisModule,
    GraphQLModule,
    AuthModule,
    BacktestModule,
    TradingAccountModule,
    StrategyModule,
    PortfolioModule,
    PositionModule,
    DashboardModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
