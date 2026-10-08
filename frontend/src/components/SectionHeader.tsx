import React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

type Props = {
  title: string;
  subtitle: string;
  onBack?: () => void;
  backLabel?: string;
};

/** `onBack` only when the section was reached from a menu grid. */
export default function SectionHeader({ title, subtitle, onBack, backLabel }: Props) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      <Box>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {subtitle}
        </Typography>
      </Box>
      {onBack && (
        <Button variant="outlined" size="small" onClick={onBack}>
          {backLabel}
        </Button>
      )}
    </Stack>
  );
}
