import { createRouter } from "../../http/route";
import { getDashboardSummary, getTopAuthorsList, getTopPrintedList, getTopViewedList } from "./dashboard";
import { toDashboardAuthorOut, toDashboardModelOut, toDashboardSummaryOut } from "./dto";
import { search } from "./search";
import { searchQuery } from "./schemas";

export const discoveryApi = createRouter();

discoveryApi.get("/search", { query: searchQuery }, ({ userId, query }) => search(userId, query.q));

// The routes below back each card's "see more" dialog.
discoveryApi.get("/dashboard/summary", async ({ userId }) => toDashboardSummaryOut(await getDashboardSummary(userId)));

discoveryApi.get("/dashboard/top-viewed", async ({ userId }) =>
  (await getTopViewedList(userId)).map(toDashboardModelOut),
);

discoveryApi.get("/dashboard/top-printed", async ({ userId }) =>
  (await getTopPrintedList(userId)).map(toDashboardModelOut),
);

discoveryApi.get("/dashboard/top-authors", async ({ userId }) =>
  (await getTopAuthorsList(userId)).map(toDashboardAuthorOut),
);
