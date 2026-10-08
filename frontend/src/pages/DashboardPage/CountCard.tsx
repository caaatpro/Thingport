import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

type Props = {
  icon: React.ReactNode;
  count: number;
  label: string;
  onClick?: () => void;
};

/** With `onClick`, the whole card is a link. */
export default function CountCard({ icon, count, label, onClick }: Props) {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 1,
        minHeight: 140,
        borderColor: (theme) => (theme.palette.mode === "dark" ? "transparent" : "divider"),
        ...(onClick && {
          cursor: "pointer",
          transition: (theme) =>
            theme.transitions.create("background-color", { duration: theme.transitions.duration.shortest }),
          "&:hover": { bgcolor: "action.hover" },
        }),
      }}
    >
      <Typography component="div" sx={{ color: "primary.main", display: "flex" }}>
        {icon}
      </Typography>
      <Typography
        variant="h3"
        sx={{
          fontWeight: 700,
          color: (theme) => theme.thingport.headingText,
        }}
      >
        {count}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
        }}
      >
        {label}
      </Typography>
    </Paper>
  );
}
