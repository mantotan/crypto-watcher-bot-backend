import { Module, Global } from '@nestjs/common';
import { GraphQLService } from './graphql.service';

@Global()
@Module({
  providers: [GraphQLService],
  exports: [GraphQLService],
})
export class GraphQLModule {}
