import { format } from "date-fns";

export function logInfo(service, message) {
  console.log(`[${format(new Date(), "yyyy-MM-dd HH:mm:ss")}] [${service}] [INFO]: ${message}`);
}

export function logError(service, message) {
  console.error(`[${format(new Date(), "yyyy-MM-dd HH:mm:ss")}] [${service}] [ERROR]: ${message}`);
}