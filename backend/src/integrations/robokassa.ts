import { createHash } from "node:crypto";

import { config } from "@/config/config";
import { ServiceUnavailableError } from "@/utils/errors";

const SIGNATURE_SEPARATOR = ":";

export interface RobokassaMerchantConfig {
  merchantLogin: string;
  password1: string;
  password2: string;
  isTest: boolean;
  paymentUrl: string;
}

export interface PaymentUrlOptions {
  orderId: string;
  amount: number;
  description: string;
  culture?: string;
}

export interface VerifySignatureOptions {
  orderId: string;
  sum: number | string;
  signature: string;
  usePassword2?: boolean;
}

function buildSignature(parts: (number | string)[]) {
  return createHash("md5").update(parts.join(SIGNATURE_SEPARATOR)).digest("hex");
}

export function formatRobokassaAmount(amount: number | string): string {
  if (typeof amount === "number") {
    return amount.toFixed(2);
  }

  const normalized = amount.toString().trim().replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isNaN(numeric)) {
    return numeric.toFixed(2);
  }

  return normalized;
}

export function getMerchantConfig(): RobokassaMerchantConfig {
  const merchantLogin = config.robokassa.merchantLogin?.trim();
  const password1 = config.robokassa.password1?.trim();
  const password2 = config.robokassa.password2?.trim();

  if (!merchantLogin || !password1 || !password2) {
    throw new ServiceUnavailableError("Robokassa integration is not configured");
  }

  return {
    merchantLogin,
    password1,
    password2,
    isTest: Boolean(config.robokassa.isTest),
    paymentUrl: config.robokassa.paymentUrl,
  };
}

export function generatePaymentURL({ orderId, amount, description, culture }: PaymentUrlOptions): string {
  const merchantConfig = getMerchantConfig();
  const formattedAmount = formatRobokassaAmount(amount);
  const signature = buildSignature([merchantConfig.merchantLogin, formattedAmount, orderId, merchantConfig.password1]);

  const url = new URL(merchantConfig.paymentUrl);
  url.searchParams.set("MerchantLogin", merchantConfig.merchantLogin);
  url.searchParams.set("OutSum", formattedAmount);
  url.searchParams.set("InvId", orderId);
  url.searchParams.set("Description", description);
  url.searchParams.set("SignatureValue", signature);

  if (merchantConfig.isTest) {
    url.searchParams.set("IsTest", "1");
  }

  if (culture) {
    url.searchParams.set("Culture", culture);
  }

  return url.toString();
}

export function verifySignature({ orderId, sum, signature, usePassword2 = true }: VerifySignatureOptions): boolean {
  const merchantConfig = getMerchantConfig();
  const formattedAmount = formatRobokassaAmount(sum);
  const password = usePassword2 ? merchantConfig.password2 : merchantConfig.password1;
  const expectedSignature = buildSignature([formattedAmount, orderId, password]);

  return expectedSignature.toLowerCase() === signature.trim().toLowerCase();
}
