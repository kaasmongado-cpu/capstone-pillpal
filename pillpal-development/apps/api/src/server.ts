import { createServer } from "node:http";
import { handleApiRequest } from "./app.js";
import { autoCancelOverdueAppointments } from "./services/appointments.js";

const PORT = Number(process.env.PORT || 4000);

const server = createServer((req, res) => {
  void handleApiRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`PILLPAL API running at http://localhost:${PORT}`);

  // Initial overdue appointment check and ongoing 60-second periodic background check
  void autoCancelOverdueAppointments();
  setInterval(() => {
    void autoCancelOverdueAppointments();
  }, 60 * 1000);
});
