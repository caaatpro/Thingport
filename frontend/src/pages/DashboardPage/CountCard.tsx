import Box from "@mui/material/Box";
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
        px: 2.5,
        py: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
        boxShadow: (theme) => theme.thingport.shadowCard,
        ...(onClick && {
          cursor: "pointer",
          transition: "box-shadow .15s ease, border-color .15s ease",
          "&:hover": {
            boxShadow: (theme) => theme.thingport.shadowHover,
            borderColor: (theme) => theme.thingport.borderStrong,
          },
        }),
      }}
    >
      <Typography
        component="div"
        sx={{
          color: "primary.main",
          bgcolor: (theme) => theme.thingport.selectedNavBackground,
          borderRadius: "12px",
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Typography>
      <Box>
        <Typography
          variant="h5"
          sx={{ fontWeight: 700, lineHeight: 1.1, color: (theme) => theme.thingport.headingText }}
        >
          {count}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {label}
        </Typography>
      </Box>
    </Paper>
  );
}
