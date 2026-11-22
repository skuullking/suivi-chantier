import { Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

export function mapsUrls(address: string, lat?: number | null, lng?: number | null) {
  const q = lat != null && lng != null ? `${lat},${lng}` : address;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`,
    waze:
      lat != null && lng != null
        ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
        : `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`,
  };
}

/** "Go there" buttons (Google Maps / Waze). */
export function MapsLinks({
  address,
  latitude,
  longitude,
  size = "sm",
}: {
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  size?: "sm" | "default" | "lg";
}) {
  const urls = mapsUrls(address, latitude, longitude);
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size={size}>
        <a href={urls.google} target="_blank" rel="noopener noreferrer">
          <Navigation aria-hidden /> Google Maps
        </a>
      </Button>
      <Button asChild variant="outline" size={size}>
        <a href={urls.waze} target="_blank" rel="noopener noreferrer">
          <Navigation aria-hidden /> Waze
        </a>
      </Button>
    </div>
  );
}
