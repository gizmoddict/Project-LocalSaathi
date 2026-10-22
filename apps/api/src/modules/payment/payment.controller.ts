// ==============================================================================
// LocalSaathi — Payment Controller (Phase 14)
// REST Endpoints, RBAC, IDOR & Webhook Ingress
// ==============================================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@localsaathi/types';
import { PaymentService } from './services/payment.service';
import { RefundService } from './services/refund.service';
import { PayoutService } from './services/payout.service';
import { WebhookService } from './services/webhook.service';
import { ReconciliationService } from './services/reconciliation.service';
import {
  initiatePaymentSchema,
  createRefundSchema,
  createPayoutSchema,
} from '@localsaathi/validation';

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly refundService: RefundService,
    private readonly payoutService: PayoutService,
    private readonly webhookService: WebhookService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  /**
   * POST /api/v1/payments
   * Initiate payment for a booking
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYER, UserRole.ADMIN)
  async initiatePayment(@Req() req: any, @Body() body: unknown) {
    const parsed = initiatePaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid payment parameters',
        errors: parsed.error.errors,
      });
    }

    return this.paymentService.initiatePayment(req.user, parsed.data);
  }

  /**
   * GET /api/v1/payments/mine
   * List current user's payments
   */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async listUserPayments(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: any,
    @Query('bookingId') bookingId?: string,
  ) {
    return this.paymentService.listUserPayments(req.user, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
      bookingId,
    });
  }

  /**
   * GET /api/v1/payments/reconciliation
   * Admin-only financial reconciliation
   */
  @Get('reconciliation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getReconciliation() {
    return this.reconciliationService.runReconciliation();
  }

  /**
   * GET /api/v1/payments/payouts/mine
   * Worker payout history
   */
  @Get('payouts/mine')
  @UseGuards(JwtAuthGuard)
  async listWorkerPayouts(@Req() req: any, @Query('workerId') workerId?: string) {
    return this.payoutService.listWorkerPayouts(req.user, workerId);
  }

  /**
   * POST /api/v1/payments/payouts
   * Admin-only worker payout initiation
   */
  @Post('payouts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createPayout(@Req() req: any, @Body() body: unknown) {
    const parsed = createPayoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid payout parameters',
        errors: parsed.error.errors,
      });
    }

    return this.payoutService.createPayout(req.user, parsed.data);
  }

  /**
   * GET /api/v1/payments/:id
   * Get payment details (IDOR protected)
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getPaymentById(@Req() req: any, @Param('id') id: string) {
    return this.paymentService.getPaymentById(req.user, id);
  }

  /**
   * GET /api/v1/payments/:id/events
   * Get payment event audit log (IDOR protected)
   */
  @Get(':id/events')
  @UseGuards(JwtAuthGuard)
  async getPaymentEvents(@Req() req: any, @Param('id') id: string) {
    return this.paymentService.getPaymentEvents(req.user, id);
  }

  /**
   * POST /api/v1/payments/:id/refund
   * Request full or partial refund
   */
  @Post(':id/refund')
  @UseGuards(JwtAuthGuard)
  async requestRefund(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = createRefundSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid refund parameters',
        errors: parsed.error.errors,
      });
    }

    return this.refundService.processRefund(req.user, id, parsed.data);
  }

  /**
   * POST /api/v1/payments/webhooks/:provider
   * Public Webhook Ingress (Cryptographically verified)
   */
  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('provider') provider: string,
    @Headers('x-razorpay-signature') rzpSignature?: string,
    @Headers('x-webhook-signature') genericSignature?: string,
    @Req() req?: any,
    @Body() body?: Record<string, unknown>,
  ) {
    const signature = rzpSignature || genericSignature || '';
    const rawBody =
      req?.rawBody ||
      (typeof body === 'string' ? body : JSON.stringify(body || {}));

    return this.webhookService.handleWebhook(
      provider,
      rawBody,
      signature,
      body || {},
    );
  }
}
