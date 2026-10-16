// Raster app icons share the checked-in L1 SVG; export-footer artwork remains its own monochrome asset.
import sharp from 'sharp';
const source=new URL('../public/favicon.svg',import.meta.url);
for(const size of [180,192,512]) await sharp(source.pathname).resize(size,size).png().toFile(new URL(`../public/nota-${size}.png`,import.meta.url).pathname);
