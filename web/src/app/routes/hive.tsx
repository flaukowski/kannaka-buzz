import { createFileRoute } from "@tanstack/react-router";
import { HivePage } from "@/features/hive/ui/HivePage";

export const Route = createFileRoute("/hive")({
  component: HivePage,
});
