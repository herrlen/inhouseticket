import { protectedResourceMetadata } from "@/lib/oauth-metadata";

export const GET = (request: Request) => protectedResourceMetadata(request);
