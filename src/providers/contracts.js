import { HttpError } from '../util.js';

// Provider boundary: implementations must verify authoritative server-to-server results.
// Neither a browser success URL nor an unverified inbound payload is proof of payment.
export class PaymentProvider {
  async createCheckout(_intent) { throw new HttpError(503, 'billing_not_configured'); }
  async verifyPayment(_paymentId, _intent) { throw new HttpError(503, 'billing_not_configured'); }
}

export class InvoiceProvider {
  async issue(_verifiedPayment) { throw new HttpError(503, 'invoicing_not_configured'); }
  async retrieve(_reference) { throw new HttpError(503, 'invoicing_not_configured'); }
}

export class PosProvider {
  async connect(_configuration) { throw new HttpError(503, 'pos_vendor_adapter_not_built'); }
  async verifyWebhook(_request) { throw new HttpError(503, 'pos_vendor_adapter_not_built'); }
  async onOrderCreated(_event) { throw new HttpError(503, 'pos_vendor_adapter_not_built'); }
  async onOrderReady(_event) { throw new HttpError(503, 'pos_vendor_adapter_not_built'); }
}

export const paymentProvider = () => new PaymentProvider();
export const invoiceProvider = () => new InvoiceProvider();
