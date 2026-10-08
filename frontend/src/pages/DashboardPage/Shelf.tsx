import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import { printsApi } from "../../api/prints";
import type { DashboardModel } from "../../api/dashboard";

type Props = {
  icon: ReactNode;
  title: string;
  models: DashboardModel[];
  /** Shown instead of the shelf when there is nothing to list. */
  emptyText?: string;
  /** Optional second line under each name, e.g. "3 days ago". */
  caption?: (model: DashboardModel) => string;
};

/** A row of thumbnail tiles; each opens its model. */
export default function Shelf({ icon, title, models, emptyText, caption }: Props) {
  const navigate = useNavigate();
  if (models.length === 0 && !emptyText) return null;

  return (
    <Box component="section">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, color: "primary.main" }}>
        {icon}
        <Typography variant="h6" component="h2" sx={{ color: (theme) => theme.thingport.headingText }}>
          {title}
        </Typography>
      </Box>
      {models.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {emptyText}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
            gap: 2,
          }}
        >
          {models.map((model) => (
            <Box
              key={model.id}
              component="a"
              href={`/models/${model.id}`}
              onClick={(event: MouseEvent) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                navigate(`/models/${model.id}`);
              }}
              sx={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                borderRadius: "14px",
                overflow: "hidden",
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                boxShadow: (theme) => theme.thingport.shadowCard,
                transition: "box-shadow .15s ease, transform .15s ease",
                "&:hover": { boxShadow: (theme) => theme.thingport.shadowHover, transform: "translateY(-2px)" },
              }}
            >
              <Box
                sx={{
                  aspectRatio: "4 / 3",
                  bgcolor: (theme) => theme.thingport.surfaceMuted,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "text.disabled",
                }}
              >
                {model.thumb_url ? (
                  <Box
                    component="img"
                    src={printsApi.fileUrl(model.thumb_url)}
                    alt=""
                    loading="lazy"
                    sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <ViewInArIcon />
                )}
              </Box>
              <Box sx={{ px: 1.5, py: 1 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }} title={model.name}>
                  {model.name}
                </Typography>
                {caption && (
                  <Typography variant="caption" noWrap sx={{ color: "text.secondary", display: "block" }}>
                    {caption(model)}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
