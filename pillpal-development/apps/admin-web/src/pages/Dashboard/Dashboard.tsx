import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Pill,
  Users,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const stats = [
  {
    title: "Total Patients",
    value: "1,248",
    description: "Registered patients",
    icon: Users,
  },
  {
    title: "Active Medications",
    value: "2,486",
    description: "Currently monitored",
    icon: Pill,
  },
  {
    title: "Today's Appointments",
    value: "24",
    description: "Scheduled today",
    icon: CalendarDays,
  },
  {
    title: "Health Alerts",
    value: "8",
    description: "Require attention",
    icon: AlertTriangle,
  },
];

const recentPatients = [
  {
    name: "Maria Santos",
    action: "Medication schedule updated",
    time: "10 minutes ago",
  },
  {
    name: "John Reyes",
    action: "Completed medication dose",
    time: "25 minutes ago",
  },
  {
    name: "Angela Cruz",
    action: "New prescription uploaded",
    time: "1 hour ago",
  },
  {
    name: "Daniel Garcia",
    action: "Appointment confirmed",
    time: "2 hours ago",
  },
];

const appointments = [
  {
    patient: "Maria Santos",
    doctor: "Dr. Rivera",
    time: "9:00 AM",
    type: "Follow-up",
  },
  {
    patient: "John Reyes",
    doctor: "Dr. Santos",
    time: "10:30 AM",
    type: "Consultation",
  },
  {
    patient: "Angela Cruz",
    doctor: "Dr. Garcia",
    time: "1:00 PM",
    type: "Medication Review",
  },
];

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dashboard
        </h1>

        <p className="text-sm text-muted-foreground">
          Overview of PILLPAL health services and patient activity.
        </p>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>

                <Icon className="h-5 w-5 text-muted-foreground" />
              </CardHeader>

              <CardContent>
                <div className="text-2xl font-bold">
                  {stat.value}
                </div>

                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Medication Adherence */}
        <Card>
          <CardHeader>
            <CardTitle>Medication Adherence</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground" />

                  <div>
                    <p className="text-sm font-medium">
                      Excellent adherence
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Patients with 90%+ adherence
                    </p>
                  </div>
                </div>

                <span className="text-lg font-semibold">
                  72%
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-muted-foreground" />

                  <div>
                    <p className="text-sm font-medium">
                      Moderate adherence
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Patients with 70–89% adherence
                    </p>
                  </div>
                </div>

                <span className="text-lg font-semibold">
                  19%
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />

                  <div>
                    <p className="text-sm font-medium">
                      Needs attention
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Patients below 70% adherence
                    </p>
                  </div>
                </div>

                <span className="text-lg font-semibold">
                  9%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Health Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Health Alerts</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-muted-foreground" />

                <div>
                  <p className="text-sm font-medium">
                    Missed medication doses
                  </p>

                  <p className="text-xs text-muted-foreground">
                    5 patients missed their scheduled doses.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-muted-foreground" />

                <div>
                  <p className="text-sm font-medium">
                    Prescription review required
                  </p>

                  <p className="text-xs text-muted-foreground">
                    2 prescriptions require healthcare staff review.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 text-muted-foreground" />

                <div>
                  <p className="text-sm font-medium">
                    Upcoming medication schedules
                  </p>

                  <p className="text-xs text-muted-foreground">
                    1 patient has an upcoming medication conflict.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Dashboard Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Patient Activity</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-5">
              {recentPatients.map((patient) => (
                <div
                  key={`${patient.name}-${patient.time}`}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {patient.name}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {patient.action}
                    </p>
                  </div>

                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {patient.time}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Appointments</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-5">
              {appointments.map((appointment) => (
                <div
                  key={`${appointment.patient}-${appointment.time}`}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {appointment.patient}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {appointment.doctor} · {appointment.type}
                    </p>
                  </div>

                  <span className="whitespace-nowrap text-sm font-medium">
                    {appointment.time}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}