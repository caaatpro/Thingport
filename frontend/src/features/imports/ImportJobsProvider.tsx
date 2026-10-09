import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { importsApi, type ImportJob } from "@/api/imports";
import { UnauthorizedError } from "@/api/client";
import { useAuth } from "@/app/auth";
import { errorMessage } from "@/app/queryClient";
import { useToast } from "@/ui";
import { useInvalidateLibrary } from "./invalidate";
import { jobCompletionMessage } from "./logic";

type JobStarter<P> = (payload: P) => Promise<void>;

export type ImportJobsValue = {
  /** Non-null while a background import runs. */
  activeJob: ImportJob | null;
  /** The last job that left RUNNING, until the user dismisses it. */
  finishedJob: ImportJob | null;
  isImporting: boolean;
  dismissFinished: () => void;
  startZipImport: JobStarter<Parameters<typeof importsApi.zipFromLink>[0]>;
  startCollectionImport: JobStarter<Parameters<typeof importsApi.fromCollection>[0]>;
  startThingiverseLikesImport: JobStarter<Parameters<typeof importsApi.fromThingiverseLikes>[0]>;
  startThingiverseCollectionImport: JobStarter<Parameters<typeof importsApi.fromThingiverseCollection>[0]>;
  startPrintablesCollectionImport: JobStarter<Parameters<typeof importsApi.fromPrintablesCollection>[0]>;
  startMakerworldProfilesImport: JobStarter<Parameters<typeof importsApi.fromMakerworldProfiles>[0]>;
};

const ImportJobsContext = createContext<ImportJobsValue | null>(null);

const POLL_MS = 1000;

/**
 * Tracks the one background import job the server allows at a time. The job is polled with React Query's
 * `refetchInterval` while it is RUNNING; when it ends the library lists are refreshed and a toast says how it went.
 */
export function ImportJobsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { onUnauthorized } = useAuth();
  const invalidateLibrary = useInvalidateLibrary();
  const [jobId, setJobId] = useState<string | null>(null);
  const notifiedRef = useRef<string | null>(null);

  const { data: job, error } = useQuery({
    queryKey: ["import-job", jobId],
    queryFn: () => importsApi.getImportJob(jobId as string),
    enabled: jobId !== null,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => (query.state.status === "error" || query.state.data?.status !== "RUNNING" ? false : POLL_MS),
  });

  // Pick up a job that was started before this page loaded (or in another tab).
  useEffect(() => {
    let cancelled = false;
    importsApi
      .getActiveImportJob()
      .then((active) => {
        if (cancelled || !active || active.status !== "RUNNING") return;
        queryClient.setQueryData(["import-job", active.id], active);
        setJobId((current) => current ?? active.id);
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) onUnauthorized();
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient, onUnauthorized]);

  // Polling errors end the job view; the library is refreshed anyway because part of it may have landed.
  useEffect(() => {
    if (!error || !jobId) return;
    if (error instanceof UnauthorizedError) onUnauthorized();
    else toast.error(errorMessage(error, "Couldn't check import progress."));
    setJobId(null);
    void invalidateLibrary();
  }, [error, jobId, onUnauthorized, toast, invalidateLibrary]);

  useEffect(() => {
    if (!job || job.status === "RUNNING" || notifiedRef.current === job.id) return;
    notifiedRef.current = job.id;
    void invalidateLibrary();
    const { tone, message } = jobCompletionMessage(job);
    toast[tone](message);
  }, [job, toast, invalidateLibrary]);

  const dismissFinished = useCallback(() => setJobId(null), []);

  const starter = useCallback(
    <P,>(run: (payload: P) => Promise<{ job_id: string }>): JobStarter<P> =>
      async (payload) => {
        try {
          const { job_id } = await run(payload);
          notifiedRef.current = null;
          setJobId(job_id);
        } catch (err) {
          if (err instanceof UnauthorizedError) onUnauthorized();
          throw err;
        }
      },
    [onUnauthorized],
  );

  const value = useMemo<ImportJobsValue>(
    () => ({
      activeJob: job?.status === "RUNNING" ? job : null,
      finishedJob: job && job.status !== "RUNNING" ? job : null,
      isImporting: job?.status === "RUNNING" || (jobId !== null && !job && !error),
      dismissFinished,
      startZipImport: starter(importsApi.zipFromLink),
      startCollectionImport: starter(importsApi.fromCollection),
      startThingiverseLikesImport: starter(importsApi.fromThingiverseLikes),
      startThingiverseCollectionImport: starter(importsApi.fromThingiverseCollection),
      startPrintablesCollectionImport: starter(importsApi.fromPrintablesCollection),
      startMakerworldProfilesImport: starter(importsApi.fromMakerworldProfiles),
    }),
    [job, jobId, error, dismissFinished, starter],
  );

  return <ImportJobsContext.Provider value={value}>{children}</ImportJobsContext.Provider>;
}

export function useImportJobs(): ImportJobsValue {
  const ctx = useContext(ImportJobsContext);
  if (!ctx) throw new Error("useImportJobs must be used inside <ImportJobsProvider>");
  return ctx;
}
