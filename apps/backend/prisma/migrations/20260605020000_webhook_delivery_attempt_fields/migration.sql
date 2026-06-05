ALTER TABLE "WebhookDelivery" ADD COLUMN "status_code" INTEGER;
ALTER TABLE "WebhookDelivery" ADD COLUMN "success" BOOLEAN NOT NULL DEFAULT false;
