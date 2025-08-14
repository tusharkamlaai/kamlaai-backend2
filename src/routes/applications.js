import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { supabaseService } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadPdf } from "../middleware/upload.js";

const router = Router();

// Apply with PDF
router.post("/", requireAuth, uploadPdf.single("resume"), async (req, res) => {
  try {
    const bodySchema = z.object({
      job_id: z.string().uuid(),
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().min(5),
      skills: z.string().optional(),
      expected_salary: z.string().optional(),
      cover_letter: z.string().optional(),
      location: z.string().optional(),
      city: z.string().optional(),
      experience: z.string().optional(),
      education: z.string().optional(),
      position_applying: z.string().optional(),
    });
    const fields = bodySchema.parse(req.body);

    // prevent duplicates
    const { data: dup, error: dupErr } = await supabaseService
      .from("applications")
      .select("id")
      .eq("job_id", fields.job_id)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (dupErr) return res.status(500).json({ error: dupErr.message });
    if (dup)
      return res.status(409).json({ error: "You already applied to this job" });

    if (!req.file)
      return res.status(400).json({ error: "resume (PDF) is required" });

    const objectName = `resumes/${req.user.id}/${nanoid(16)}.pdf`;
    const { error: upErr } = await supabaseService.storage
      .from("resumes")
      .upload(objectName, req.file.buffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) return res.status(500).json({ error: upErr.message });

    const insertPayload = {
      ...fields,
      user_id: req.user.id,
      resume_path: objectName,
      status: "pending",
    };

    const { data, error } = await supabaseService
      .from("applications")
      .insert(insertPayload)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json({ application: data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// current user's applications
// current user's applied job posts (not application fields)
router.get("/my-applications", requireAuth, async (req, res) => {
  try {
    // 1) Get the user's applications (only job_id + applied_at)
    const { data: apps, error: appsErr } = await supabaseService
      .from("applications")
      .select("job_id, applied_at")
      .eq("user_id", req.user.id)
      .order("applied_at", { ascending: false });

    if (appsErr) return res.status(500).json({ error: appsErr.message });
    if (!apps || apps.length === 0) return res.json({ jobs: [] });

    // keep order by applied_at (latest first)
    const orderByApplied = apps.map((a) => a.job_id);
    const jobIds = [...new Set(orderByApplied)];

    // 2) Fetch those job posts (service role → includes inactive too)
    const { data: jobs, error: jobsErr } = await supabaseService
      .from("jobs")
      .select(
        "id, title, description, requirements, skills, location,experience, salary_range, is_active, posted_by, created_at, updated_at"
      )
      .in("id", jobIds);

    if (jobsErr) return res.status(500).json({ error: jobsErr.message });

    // 3) Sort jobs to match applied_at order
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const orderedJobs = orderByApplied
      .map((id) => byId.get(id))
      .filter(Boolean);

    return res.json({ jobs: orderedJobs });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// signed URL to own resume (or admin)
router.get("/:id/resume-url", requireAuth, async (req, res) => {
  const { data: appRec, error: gErr } = await supabaseService
    .from("applications")
    .select("id,user_id,resume_path")
    .eq("id", req.params.id)
    .single();
  if (gErr) return res.status(404).json({ error: "Application not found" });
  if (appRec.user_id !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseService.storage
    .from("resumes")
    .createSignedUrl(appRec.resume_path, 600);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ url: data.signedUrl });
});

// delete own resume
router.delete("/:id/resume", requireAuth, async (req, res) => {
  const { data: appRec, error: gErr } = await supabaseService
    .from("applications")
    .select("id,user_id,resume_path")
    .eq("id", req.params.id)
    .single();
  if (gErr) return res.status(404).json({ error: "Application not found" });
  if (appRec.user_id !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "Forbidden" });

  const { error } = await supabaseService.storage
    .from("resumes")
    .remove([appRec.resume_path]);
  if (error) return res.status(500).json({ error: error.message });

  await supabaseService
    .from("applications")
    .update({ resume_path: null, updated_at: new Date().toISOString() })
    .eq("id", appRec.id);
  res.json({ ok: true });
});

export default router;
