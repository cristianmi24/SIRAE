import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { X } from "lucide-react";
import { useDialogBehavior } from "../../lib/ui-hooks";
import type { StudentDto } from "../../../../shared/types";
import { ApiClientError, api, type QrDelivery, type StudentInput } from "../../services/api";

const formSchema = z.object({
  firstName: z.string().trim().min(2, "Escribe el nombre.").max(80),
  lastName: z.string().trim().min(2, "Escribe los apellidos.").max(100),
  courseGroupId: z.string().optional(),
  newGrade: z.string().trim().max(64).optional(),
  newGroup: z.string().trim().max(32).optional(),
});

const NEW_COURSE = "__new__";
type StudentFormValues = z.infer<typeof formSchema>;
type StudentMutationResult = { item: StudentDto } | { student: StudentDto; qr: QrDelivery };

export function StudentForm({
  student,
  onClose,
  onSaved,
}: {
  student?: StudentDto;
  onClose: () => void;
  onSaved: (savedStudent: StudentDto, qr?: QrDelivery) => void;
}) {
  const queryClient = useQueryClient();
  const groups = useQuery({ queryKey: ["courseGroups"], queryFn: api.getCourseGroups });
  const auth = useQuery({ queryKey: ["auth"], queryFn: api.getMe });
  const canCreateCourse = auth.data?.user?.role === "ADMIN";
  const form = useForm<StudentFormValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: {
      firstName: student?.firstName ?? "",
      lastName: student?.lastName ?? "",
      courseGroupId: student?.courseGroup?.id || "",
      newGrade: "",
      newGroup: "",
    },
  });
  const isNewCourse = form.watch("courseGroupId") === NEW_COURSE;

  const mutation = useMutation<StudentMutationResult, ApiClientError, StudentFormValues>({
    mutationFn: async ({ newGrade, newGroup, ...values }) => {
      if (values.courseGroupId === NEW_COURSE) {
        const grade = newGrade?.trim() ?? ""; const group = newGroup?.trim() ?? "";
        if (!grade || !group) throw new ApiClientError(400, "COURSE_REQUIRED", "Escribe el curso y el grupo nuevos.");
        const existing = groups.data?.items.find((item) => item.grade.toLowerCase() === grade.toLowerCase() && item.group.toLowerCase() === group.toLowerCase());
        values.courseGroupId = existing?.id ?? (await api.createCourseGroup({ grade, group, academicYear: new Date().getFullYear() })).item.id;
      }
      // Solo nombre y apellidos: el código lo genera el sistema y no se guardan datos de contacto.
      const input: StudentInput = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        courseGroupId: values.courseGroupId || (student ? null : undefined),
        ...(student ? { email: null, phone: null } : {}),
      };
      return student ? api.updateStudent(student.id, input) : api.createStudent(input);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["students"] }),
        queryClient.invalidateQueries({ queryKey: ["student", student?.id] }),
        queryClient.invalidateQueries({ queryKey: ["courseGroups"] }),
        queryClient.invalidateQueries({ queryKey: ["groups"] }),
      ]);
      if ("student" in result) {
        onSaved(result.student, result.qr);
      } else {
        onSaved(result.item);
      }
    },
  });

  const dialogRef = useDialogBehavior(onClose);
  const errors = form.formState.errors;
  const submit = form.handleSubmit((values) => mutation.mutate(values));
  const error = mutation.error as ApiClientError | undefined;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section ref={dialogRef} className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="student-form-title">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar formulario" title="Cerrar (Esc)"><X size={20} /></button>
        <h2 id="student-form-title">{student ? "Editar estudiante" : "Registrar estudiante"}</h2>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="form-field"><label htmlFor="firstName">Nombres</label><input id="firstName" autoComplete="off" aria-invalid={Boolean(errors.firstName)} aria-describedby="firstName-error" placeholder="Ej. Juliana" {...form.register("firstName")} />{errors.firstName ? <small id="firstName-error" role="alert">{errors.firstName.message}</small> : null}</div>
            <div className="form-field"><label htmlFor="lastName">Apellidos</label><input id="lastName" autoComplete="off" aria-invalid={Boolean(errors.lastName)} aria-describedby="lastName-error" placeholder="Ej. Salazar Ruiz" {...form.register("lastName")} />{errors.lastName ? <small id="lastName-error" role="alert">{errors.lastName.message}</small> : null}</div>
            <div className="form-field form-full"><label htmlFor="courseGroupId">Curso y grupo</label><select id="courseGroupId" {...form.register("courseGroupId")}><option value="">Sin asignar todavía</option>{groups.data?.items.map((group) => <option value={group.id} key={group.id}>Curso {group.grade} · Grupo {group.group}</option>)}{canCreateCourse && <option value={NEW_COURSE}>+ Crear curso nuevo</option>}</select></div>
            {isNewCourse && <div className="form-full new-course-row"><div className="form-field"><label htmlFor="newGrade">Curso nuevo</label><input id="newGrade" placeholder="Ej. 8" {...form.register("newGrade")} /></div><div className="form-field"><label htmlFor="newGroup">Grupo</label><input id="newGroup" placeholder="Ej. A" {...form.register("newGroup")} /></div></div>}
            {student ? <p className="helper-text form-full">Código del estudiante: <strong className="code-tag">{student.document}</strong></p> : <p className="helper-text form-full">Al guardar, el sistema le asigna un código único para registrar su asistencia.</p>}
          </div>
          {error ? <p className="form-error" role="alert">{error.message}</p> : null}
          <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={mutation.isPending}>{mutation.isPending ? "Guardando…" : student ? "Guardar cambios" : "Registrar estudiante"}</button></div>
        </form>
      </section>
    </div>
  );
}
