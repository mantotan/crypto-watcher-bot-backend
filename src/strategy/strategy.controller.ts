import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { StrategyService } from './strategy.service';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { CopyStrategyDto } from './dto/copy-strategy.dto';
import { ListStrategiesQueryDto } from './dto/list-strategies-query.dto';
import { ListPublicStrategiesQueryDto } from './dto/list-public-strategies-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Strategies')
@Controller('strategies')
export class StrategyController {
  constructor(private strategyService: StrategyService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List user strategies',
    description: 'Returns paginated list of strategies for the authenticated user with optional filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategies retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async listStrategies(@Request() req, @Query() query: ListStrategiesQueryDto) {
    return this.strategyService.listStrategies(req.user.id, query);
  }

  @Get('public')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Browse public strategies marketplace',
    description: 'Returns paginated list of public strategies from all users. User data is anonymized.',
  })
  @ApiResponse({
    status: 200,
    description: 'Public strategies retrieved successfully',
  })
  async listPublicStrategies(@Query() query: ListPublicStrategiesQueryDto) {
    return this.strategyService.listPublicStrategies(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get strategy details',
    description:
      'Returns detailed information about a strategy including portfolios and trading account. ' +
      'User must own the strategy OR strategy must be public.',
  })
  @ApiParam({
    name: 'id',
    description: 'Strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategy retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 403,
    description: 'You do not have access to this strategy',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getStrategyById(@Request() req, @Param('id') id: string) {
    return this.strategyService.getStrategyById(req.user.id, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create new strategy',
    description:
      'Creates a new trading strategy and an initial portfolio. The portfolio type matches the strategy mode (PAPER by default).',
  })
  @ApiResponse({
    status: 201,
    description: 'Strategy created successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Trading account not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Strategy with this name already exists for this account',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async createStrategy(@Request() req, @Body() dto: CreateStrategyDto) {
    return this.strategyService.createStrategy(req.user.id, dto);
  }

  @Post(':id/copy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Copy a public strategy',
    description:
      'Creates a copy of a public strategy linked to your trading account. ' +
      'The copied strategy starts in PAPER mode and is_live=false.',
  })
  @ApiParam({
    name: 'id',
    description: 'Source strategy ID to copy',
  })
  @ApiResponse({
    status: 201,
    description: 'Strategy copied successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy or trading account not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Source strategy is not public',
  })
  @ApiResponse({
    status: 409,
    description: 'Strategy with this name already exists for this account',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async copyStrategy(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CopyStrategyDto,
  ) {
    return this.strategyService.copyStrategy(req.user.id, id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update strategy settings',
    description:
      'Updates strategy configuration. Cannot change mode while is_live=true. ' +
      'Cannot switch to REAL mode without a REAL portfolio.',
  })
  @ApiParam({
    name: 'id',
    description: 'Strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategy updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid update - check validation rules',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Strategy with this name already exists for this account',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async updateStrategy(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateStrategyDto,
  ) {
    return this.strategyService.updateStrategy(req.user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete strategy',
    description:
      'Deletes a strategy. Cannot delete if is_live=true or if there are open positions. ' +
      'This action is permanent.',
  })
  @ApiParam({
    name: 'id',
    description: 'Strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategy deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete - strategy is live or has open positions',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async deleteStrategy(@Request() req, @Param('id') id: string) {
    return this.strategyService.deleteStrategy(req.user.id, id);
  }

  @Post(':id/archive')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Archive strategy',
    description:
      'Archives a strategy. Cannot archive if is_live=true. ' +
      'Archived strategies are hidden by default but can be filtered in list endpoints.',
  })
  @ApiParam({
    name: 'id',
    description: 'Strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategy archived successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot archive - strategy is live or already archived',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async archiveStrategy(@Request() req, @Param('id') id: string) {
    return this.strategyService.archiveStrategy(req.user.id, id);
  }

  @Post(':id/unarchive')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Unarchive strategy',
    description: 'Unarchives a strategy. Strategy must be archived.',
  })
  @ApiParam({
    name: 'id',
    description: 'Strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategy unarchived successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot unarchive - strategy is not archived',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async unarchiveStrategy(@Request() req, @Param('id') id: string) {
    return this.strategyService.unarchiveStrategy(req.user.id, id);
  }

}
