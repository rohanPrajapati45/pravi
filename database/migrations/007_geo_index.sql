-- Map-area (bounding box) queries for GET /assets/geo.
create index if not exists assets_lat_lng_idx on assets (lat, lng) where lat is not null and lng is not null;
