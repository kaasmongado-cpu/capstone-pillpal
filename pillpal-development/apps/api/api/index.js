import { handleApiRequest } from "../dist/vercel-bundle.mjs";

export default async function handler(req, res) {
  await handleApiRequest(req, res);
}
