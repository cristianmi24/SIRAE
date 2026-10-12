import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import { ADMIN_CONTACT_EMAIL } from "../../../shared/limits.js";

// Pruebas de extremo a extremo de la API contra una base MongoDB real.
// Se ejecutan solo si TEST_MONGODB_URI apunta a un servidor de pruebas (por ejemplo mongodb://127.0.0.1:27017).
const baseUri = process.env.TEST_MONGODB_URI;
const ORIGIN = "http://sirae.test";
const run = Date.now().toString(36);
const email = (name: string) => `${name}.${run}@sirae.test`;

describe.skipIf(!baseUri)("API de SIRAE (integración)", () => {
  let app: Express;
  type Agent = ReturnType<typeof request.agent>;
  const post = (agent: Agent, path: string, body?: unknown) => agent.post(path).set("Origin", ORIGIN).send(body as object);
  const patch = (agent: Agent, path: string, body?: unknown) => agent.patch(path).set("Origin", ORIGIN).send(body as object);

  async function register(name: string, accountType: "PERSONAL" | "INSTITUTION", extra: Record<string, string> = {}) {
    const agent = request.agent(app);
    const response = await post(agent, "/api/auth/register", { name, email: email(name), password: "clave-segura-123", accountType, ...extra });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return agent;
  }
  async function createCourse(agent: Agent, grade: string, group = "A") {
    return post(agent, "/api/course-groups", { grade, group, academicYear: 2026 });
  }

  beforeAll(async () => {
    const url = new URL(baseUri!);
    url.pathname = `/sirae_test_${run}`;
    process.env.MONGODB_URI = url.toString();
    process.env.AUTH_JWT_SECRET = "x".repeat(48);
    process.env.APP_ORIGIN = ORIGIN;
    process.env.NODE_ENV = "test";
    process.env.AULANEXO_ADMIN_EMAIL = `admin.${run}@sirae.test`;
    process.env.AULANEXO_ADMIN_PASSWORD = "clave-admin-123";
    const { createApp, addFinalErrorHandling } = await import("../app.js");
    const { connectToDatabase } = await import("../config/database.js");
    await connectToDatabase();
    app = createApp();
    addFinalErrorHandling(app);
  }, 30_000);

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
  });

  describe("registro con tipo de cuenta", () => {
    it("guarda el tipo Docente y lo informa en la sesión", async () => {
      const agent = await register("docente1", "PERSONAL");
      const me = await agent.get("/api/auth/me");
      expect(me.body.user).toMatchObject({ accountType: "PERSONAL", role: "ADMIN", institution: { type: "PERSONAL" } });
      expect(me.body.user.plan).toMatchObject({ accountType: "PERSONAL", contactEmail: ADMIN_CONTACT_EMAIL, limits: { courses: 4 } });
    });

    it("guarda el tipo Institución y exige su nombre", async () => {
      const bad = await post(request.agent(app), "/api/auth/register", { name: "Sin Nombre", email: email("inst-bad"), password: "clave-segura-123", accountType: "INSTITUTION" });
      expect(bad.status).toBe(400);
      const agent = await register("inst0", "INSTITUTION", { institutionName: "Colegio Prueba" });
      const me = await agent.get("/api/auth/me");
      expect(me.body.user).toMatchObject({ accountType: "INSTITUTION", institution: { name: "Colegio Prueba", type: "INSTITUTION" } });
      expect(me.body.user.plan.limits).toMatchObject({ teachers: 5, coursesPerTeacher: 6 });
    });
  });

  describe("límites por tipo de cuenta", () => {
    it("una cuenta de docente admite 4 cursos y rechaza el quinto con el correo de contacto", async () => {
      const agent = await register("docente2", "PERSONAL");
      for (const grade of ["6", "7", "8", "9"]) expect((await createCourse(agent, grade)).status).toBe(201);
      const fifth = await createCourse(agent, "10");
      expect(fifth.status).toBe(409);
      expect(fifth.body.error.code).toBe("PLAN_LIMIT_REACHED");
      expect(fifth.body.error.details.contactEmail).toBe("cpenataandrades2023@gmail.com");
      expect(fifth.body.error.message).toContain("cpenataandrades2023@gmail.com");
      const list = await agent.get("/api/course-groups");
      expect(list.body.items).toHaveLength(4);
    });

    it("una cuenta de docente no puede invitar docentes", async () => {
      const agent = await register("docente3", "PERSONAL");
      const course = await createCourse(agent, "6");
      const invite = await post(agent, "/api/learning/invitations", { email: email("x"), role: "DOCENTE", courseGroupIds: [course.body.item.id] });
      expect(invite.status).toBe(409);
      expect(invite.body.error.code).toBe("PLAN_LIMIT_REACHED");
    });
  });

  describe("institución: docentes, cursos y estudiantes", () => {
    let institution: Agent; let courses: string[] = []; let teacher: Agent;
    beforeAll(async () => {
      institution = await register("inst1", "INSTITUTION", { institutionName: "Colegio Uno" });
      courses = [];
      for (let i = 1; i <= 7; i++) courses.push((await createCourse(institution, `Grado ${i}`)).body.item.id);
    });

    it("rechaza asignar más de 6 cursos a un docente", async () => {
      const invite = await post(institution, "/api/learning/invitations", { email: email("t-many"), role: "DOCENTE", courseGroupIds: courses });
      expect(invite.status).toBe(409);
      expect(invite.body.error.details.contactEmail).toBe(ADMIN_CONTACT_EMAIL);
    });

    it("permite 5 docentes y rechaza el sexto", async () => {
      for (let i = 1; i <= 5; i++) {
        const invite = await post(institution, "/api/learning/invitations", { email: email(`t${i}`), role: "DOCENTE", courseGroupIds: [courses[i - 1]] });
        expect(invite.status, JSON.stringify(invite.body)).toBe(201);
      }
      const sixth = await post(institution, "/api/learning/invitations", { email: email("t6"), role: "DOCENTE", courseGroupIds: [courses[5]] });
      expect(sixth.status).toBe(409);
      expect(sixth.body.error.code).toBe("PLAN_LIMIT_REACHED");
    });

    it("el docente invitado que se registra queda asociado a la institución y solo ve sus cursos", async () => {
      teacher = await register("t1", "PERSONAL");
      const me = await teacher.get("/api/auth/me");
      expect(me.body.user).toMatchObject({ role: "DOCENTE", institution: { name: "Colegio Uno", type: "INSTITUTION" } });
      const visible = await teacher.get("/api/course-groups");
      expect(visible.body.items.map((x: { id: string }) => x.id)).toEqual([courses[0]]);
      const student = await post(teacher, "/api/students", { firstName: "Ana", lastName: "Pérez", courseGroupId: courses[0] });
      expect(student.status).toBe(201);
      const foreign = await post(teacher, "/api/students", { firstName: "Luis", lastName: "Gómez", courseGroupId: courses[1] });
      expect(foreign.status).toBe(404);
    });

    it("muestra a la institución solo sus docentes, con cursos y estudiantes", async () => {
      const overview = await institution.get("/api/learning/institution/overview");
      expect(overview.status).toBe(200);
      expect(overview.body.teachers).toHaveLength(1);
      const [row] = overview.body.teachers;
      expect(row.courses.map((c: { id: string }) => c.id)).toEqual([courses[0]]);
      expect(row.students).toBe(1);
      expect(overview.body.pendingInvitations).toHaveLength(4);
      const students = await institution.get(`/api/learning/institution/teachers/${row.membershipId}/courses/${courses[0]}/students`);
      expect(students.status).toBe(200);
      expect(students.body.students.map((s: { name: string }) => s.name)).toEqual(["Ana Pérez"]);
      // Un curso que el docente no tiene asignado no se expone por esa ruta.
      expect((await institution.get(`/api/learning/institution/teachers/${row.membershipId}/courses/${courses[1]}/students`)).status).toBe(404);
      // El docente no puede ver la vista de la institución.
      expect((await teacher.get("/api/learning/institution/overview")).status).toBe(403);
      // Otra institución no ve a este docente.
      const other = await register("inst2", "INSTITUTION", { institutionName: "Colegio Dos" });
      expect((await other.get("/api/learning/institution/overview")).body.teachers).toHaveLength(0);
      expect((await other.get(`/api/learning/institution/teachers/${row.membershipId}/courses/${courses[0]}/students`)).status).toBe(404);
    });

    it("no permite superar 6 cursos al actualizar la membresía", async () => {
      const overview = await institution.get("/api/learning/institution/overview");
      const membershipId = overview.body.teachers[0].membershipId;
      const tooMany = await patch(institution, `/api/learning/memberships/${membershipId}`, { role: "DOCENTE", courseGroupIds: courses });
      expect(tooMany.status).toBe(409);
      const ok = await patch(institution, `/api/learning/memberships/${membershipId}`, { role: "DOCENTE", courseGroupIds: courses.slice(0, 6) });
      expect(ok.status).toBe(200);
    });
  });

  describe("reapertura de sesiones", () => {
    let agent: Agent; let sessionId = ""; let codes: string[] = []; let studentIds: string[] = [];
    beforeAll(async () => {
      agent = await register("docente-reopen", "PERSONAL");
      const course = (await createCourse(agent, "11")).body.item.id;
      const subject = await post(agent, "/api/learning/subjects", { name: "Física", courseGroupIds: [course] });
      const schedule = await post(agent, "/api/learning/schedules", { courseGroupId: course, subjectId: subject.body.item.id, weekdays: [1, 2, 3, 4, 5, 6, 7], startTime: "00:00", endTime: "23:59", toleranceMinutes: 10 });
      codes = []; studentIds = [];
      for (const name of ["Ana", "Beto", "Caro"]) {
        const created = await post(agent, "/api/students", { firstName: name, lastName: "Prueba", courseGroupId: course });
        codes.push(created.body.student.document); studentIds.push(created.body.student.id);
      }
      const context = await agent.get("/api/learning/attendance/context");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: context.body.timezone }).format(new Date());
      sessionId = (await post(agent, "/api/learning/attendance/sessions", { scheduleId: schedule.body.item.id, dateKey: today })).body.item.id;
    });

    it("reabre una clase cerrada, conserva los registros y permite registrar de nuevo sin duplicar", async () => {
      expect((await post(agent, `/api/learning/attendance/sessions/${sessionId}/mark`, { studentId: studentIds[0], status: "PRESENT" })).status).toBe(200);
      const linkBefore = await post(agent, `/api/learning/attendance/sessions/${sessionId}/link`, { minutes: 30, autoClose: false });
      const token = linkBefore.body.item.token;
      const closed = await post(agent, `/api/learning/attendance/sessions/${sessionId}/close`);
      expect(closed.body.item).toMatchObject({ state: "CLOSED", absencesCreated: 2 });

      const reopened = await post(agent, `/api/learning/attendance/sessions/${sessionId}/reopen`);
      expect(reopened.status).toBe(200);
      expect(reopened.body.item).toMatchObject({ state: "OPEN", absencesRemoved: 2 });
      const roster = await agent.get(`/api/learning/attendance/sessions/${sessionId}`);
      expect(roster.body.session.state).toBe("OPEN");
      const byId = new Map(roster.body.items.map((row: { studentId: string; status: string; hasRecord: boolean }) => [row.studentId, row]));
      expect(byId.get(studentIds[0])).toMatchObject({ status: "PRESENT", hasRecord: true });
      expect(byId.get(studentIds[1])).toMatchObject({ hasRecord: false });
      const sessions = await agent.get("/api/learning/attendance/sessions");
      expect(sessions.body.items.find((s: { id: string }) => s.id === sessionId).state).toBe("OPEN");

      // El enlace de la jornada vuelve a aceptar registros.
      const link = await agent.get(`/api/learning/attendance/sessions/${sessionId}/link`);
      expect(link.body.item.state).toBe("ACTIVE");
      const student = request.agent(app);
      await student.get(`/api/public/attendance/${token}`);
      const registered = await post(student, `/api/public/attendance/${token}`, { code: codes[1] });
      expect(registered.status, JSON.stringify(registered.body)).toBe(200);
      // El mismo código no se registra dos veces.
      const again = request.agent(app);
      await again.get(`/api/public/attendance/${token}`);
      expect((await post(again, `/api/public/attendance/${token}`, { code: codes[1] })).body.error.code).toBe("CODE_ALREADY_USED");
      // Quien ya tenía registro tampoco se duplica.
      const third = request.agent(app);
      await third.get(`/api/public/attendance/${token}`);
      expect((await post(third, `/api/public/attendance/${token}`, { code: codes[0] })).body.error.code).toBe("CODE_ALREADY_USED");

      const after = await agent.get(`/api/learning/attendance/sessions/${sessionId}`);
      expect(after.body.items.filter((row: { hasRecord: boolean }) => row.hasRecord)).toHaveLength(2);
      // Al cerrar de nuevo, solo quien no se registró queda ausente.
      const closedAgain = await post(agent, `/api/learning/attendance/sessions/${sessionId}/close`);
      expect(closedAgain.body.item.absencesCreated).toBe(1);
      const final = await agent.get(`/api/learning/attendance/sessions/${sessionId}`);
      expect(final.body.summary).toMatchObject({ total: 3, absent: 1 });
      expect(final.body.items.length).toBe(3);
    });

    it("conserva los horarios de la sesión al reabrir", async () => {
      const before = (await agent.get(`/api/learning/attendance/sessions/${sessionId}`)).body.session;
      await post(agent, `/api/learning/attendance/sessions/${sessionId}/reopen`);
      const after = (await agent.get(`/api/learning/attendance/sessions/${sessionId}`)).body.session;
      expect(after.state).toBe("OPEN");
      expect([after.startsAt, after.endsAt, after.scheduledStartsAt, after.toleranceMinutes]).toEqual([before.startsAt, before.endsAt, before.scheduledStartsAt, before.toleranceMinutes]);
    });

    it("los reportes PDF siguen generándose", async () => {
      for (const path of ["/api/students/codes.pdf", `/api/learning/reports/students/${studentIds[0]}.pdf`]) {
        const pdf = await agent.get(path).buffer(true).parse((res, done) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => done(null, Buffer.concat(chunks))); });
        expect(pdf.status, path).toBe(200);
        expect(pdf.headers["content-type"]).toContain("application/pdf");
        expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
      }
    });

    it("solo quien tiene acceso puede reabrir", async () => {
      await post(agent, `/api/learning/attendance/sessions/${sessionId}/close`);
      const stranger = await register("docente-ajeno", "PERSONAL");
      expect((await post(stranger, `/api/learning/attendance/sessions/${sessionId}/reopen`)).status).toBe(404);
      expect((await post(request.agent(app), `/api/learning/attendance/sessions/${sessionId}/reopen`)).status).toBe(401);
    });
  });

  describe("quejas y solicitudes", () => {
    const valid = { type: "ELIMINACION_DATOS", requesterRole: "PADRE_ACUDIENTE", name: "Marta Gómez", email: "marta@correo.test", studentName: "Ana Gómez", institutionName: "Colegio Uno", message: "Solicito eliminar los datos de mi hija del sistema.", consent: true };
    it("recibe la solicitud pública y la entrega solo al administrador de la plataforma", async () => {
      const visitor = request.agent(app);
      const sent = await post(visitor, "/api/public/complaints", valid);
      expect(sent.status, JSON.stringify(sent.body)).toBe(201);
      expect(sent.body.ticket).toMatch(/^Q-[A-Z2-9]{6}$/);
      expect((await post(visitor, "/api/public/complaints", { ...valid, consent: false })).status).toBe(400);
      expect((await post(visitor, "/api/public/complaints", { ...valid, website: "spam.example" })).status).toBe(400);
      expect((await post(visitor, "/api/public/complaints", { ...valid, message: { $gt: "" } })).status).toBe(400);

      const teacher = await register("docente-quejas", "PERSONAL");
      expect((await teacher.get("/api/platform/complaints")).status).toBe(403);
      expect((await request(app).get("/api/platform/complaints")).status).toBe(401);

      const admin = request.agent(app);
      expect((await post(admin, "/api/auth/login", { email: process.env.AULANEXO_ADMIN_EMAIL, password: "clave-admin-123" })).status).toBe(200);
      const list = await admin.get("/api/platform/complaints");
      expect(list.status).toBe(200);
      const item = list.body.items.find((row: { ticket: string }) => row.ticket === sent.body.ticket);
      expect(item).toMatchObject({ type: "ELIMINACION_DATOS", status: "NUEVA", studentName: "Ana Gómez" });
      expect(list.body.counts.NUEVA).toBeGreaterThanOrEqual(1);
      const done = await patch(admin, `/api/platform/complaints/${item.id}`, { status: "RESUELTA", adminNote: "Datos eliminados" });
      expect(done.status).toBe(200);
      expect(done.body.item).toMatchObject({ status: "RESUELTA", adminNote: "Datos eliminados" });
      expect(done.body.item.resolvedAt).toBeTruthy();
      expect((await patch(teacher, `/api/platform/complaints/${item.id}`, { status: "NUEVA" })).status).toBe(403);
    });
  });

  describe("seguridad de entradas", () => {
    it("rechaza operadores de MongoDB en el cuerpo", async () => {
      const login = await post(request.agent(app), "/api/auth/login", { email: { $ne: null }, password: { $gt: "" } });
      expect(login.status).toBe(400);
      const nested = await post(request.agent(app), "/api/public/student-report", { code: "ABC", $where: "1" });
      expect(nested.status).toBe(400);
      expect(nested.body.error.code).toBe("UNSAFE_PAYLOAD");
    });

    it("rechaza solicitudes de otro origen y sesiones inexistentes", async () => {
      const foreign = await request(app).post("/api/course-groups").set("Origin", "https://evil.example").send({ grade: "1", group: "A", academicYear: 2026 });
      expect(foreign.status).toBe(403);
      expect((await request(app).get("/api/students")).status).toBe(401);
    });

    it("responde 400 ante identificadores mal formados", async () => {
      const agent = await register("docente-ids", "PERSONAL");
      expect((await agent.get("/api/learning/attendance/sessions?date=not-a-date")).status).toBe(400);
      expect((await agent.get("/api/students/zzz")).status).toBe(400);
    });
  });
  describe("QR del estudiante en varias materias", () => {
    it("el mismo QR registra la asistencia de la clase donde se escanea, sin mezclar materias ni cursos", async () => {
      const { Student } = await import("../models/index.js");
      const agent = await register("docente-qr-materias", "PERSONAL");
      const course = (await createCourse(agent, "9")).body.item.id;
      const otherCourse = (await createCourse(agent, "10")).body.item.id;
      const physics = (await post(agent, "/api/learning/subjects", { name: "Física", courseGroupIds: [course, otherCourse] })).body.item.id;
      const chemistry = (await post(agent, "/api/learning/subjects", { name: "Química", courseGroupIds: [course] })).body.item.id;
      const schedule = (courseGroupId: string, subjectId: string) => post(agent, "/api/learning/schedules", { courseGroupId, subjectId, weekdays: [1, 2, 3, 4, 5, 6, 7], startTime: "00:00", endTime: "23:59", toleranceMinutes: 10 });
      const physicsSchedule = (await schedule(course, physics)).body.item.id;
      const chemistrySchedule = (await schedule(course, chemistry)).body.item.id;
      const otherSchedule = (await schedule(otherCourse, physics)).body.item.id;
      const created = await post(agent, "/api/students", { firstName: "Laura", lastName: "Qr", courseGroupId: course });
      const tokenHash = (await Student.findById(created.body.student.id).select("qrTokenHash"))!.qrTokenHash as string;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: (await agent.get("/api/learning/attendance/context")).body.timezone }).format(new Date());
      const open = async (scheduleId: string) => (await post(agent, "/api/learning/attendance/sessions", { scheduleId, dateKey: today })).body.item.id as string;
      const [physicsSession, chemistrySession, otherSession] = [await open(physicsSchedule), await open(chemistrySchedule), await open(otherSchedule)];
      const scan = (classSessionId: string) => post(agent, `/api/learning/attendance/sessions/${classSessionId}/scan`, { tokenHash, clientEventId: randomUUID() });
      const records = async (sessionId: string) => (await agent.get(`/api/learning/attendance/sessions/${sessionId}`)).body.items.filter((row: { hasRecord: boolean }) => row.hasRecord);

      // Escanear en Física registra solo Física.
      const first = await scan(physicsSession);
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.duplicate).toBe(false);
      expect(await records(physicsSession)).toHaveLength(1);
      expect(await records(chemistrySession)).toHaveLength(0);
      // El mismo QR en Química es un registro nuevo, no un duplicado de Física.
      const second = await scan(chemistrySession);
      expect(second.body.duplicate).toBe(false);
      expect(await records(chemistrySession)).toHaveLength(1);
      // Repetir en la misma clase sí es duplicado.
      expect((await scan(physicsSession)).body.duplicate).toBe(true);
      expect(await records(physicsSession)).toHaveLength(1);
      // Cada registro queda con la materia de su clase.
      const { Attendance } = await import("../models/learning.js");
      const rows = await Attendance.find({ studentId: created.body.student.id }).lean();
      expect(rows.map((row) => String(row.subjectId)).sort()).toEqual([physics, chemistry].sort());
      // Una clase de otro curso rechaza al estudiante.
      const wrong = await scan(otherSession);
      expect(wrong.status).toBe(409);
      expect(wrong.body.error.code).toBe("STUDENT_NOT_IN_GROUP");
    }, 90_000);
  });
});
