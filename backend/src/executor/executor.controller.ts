import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ExecutorService } from './executor.service';
import { ExecutePaymentRequestDto } from './dto/execute-payment.dto';

@Controller('executor')
export class ExecutorController {
  constructor(private readonly executorService: ExecutorService) {}

  @Get('status')
  getStatus() {
    return this.executorService.getStatus();
  }

  @Post('payments')
  @HttpCode(HttpStatus.OK)
  async executePayment(@Body() body: ExecutePaymentRequestDto) {
    return this.executorService.executeBoundedPayment(body);
  }
}
