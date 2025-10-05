import { ee } from './earthEngineService';

// Define the structure for our recipe parameters
export interface RecipeParams {
  boundingBox: ee.Geometry.Rectangle;
  startDate: string;
  endDate: string;
}

/**
 * A helper function to mask clouds using the MODIS QA band.
 * @param {ee.Image} image The MODIS image to mask.
 * @returns {ee.Image} The cloud-masked image.
 */
function maskClouds(image: ee.Image): ee.Image {
  // Select the QA band
  const qa = image.select('state_1km');
  // Create a mask for bits 0 and 1, which represent cloud state.
  // We want to keep pixels where the state is "clear" (0).
  const cloudMask = qa.bitwiseAnd(0b11).eq(0);
  return image.updateMask(cloudMask);
}

/**
 * RECIPE A: "True-Color Enhanced Reality"
 * Generates a cloud-masked, true-color image collection for a given area and time.
 * @param {RecipeParams} params The parameters for the recipe.
 * @returns {ee.ImageCollection} An Earth Engine ImageCollection ready for video export.
 */
export function trueColorRecipe({ boundingBox, startDate, endDate }: RecipeParams): ee.ImageCollection {
  const imageCollection = ee.ImageCollection('MODIS/061/MOD09GA')
    .filterDate(startDate, endDate)
    .filterBounds(boundingBox)
    .map(maskClouds);

  // Define visualization parameters for a true-color image.
  // These values are standard for MODIS surface reflectance.
  const visParams = {
    bands: ['sur_refl_b01', 'sur_refl_b04', 'sur_refl_b03'], // R, G, B
    min: 0,
    max: 4000,
    gamma: 1.4,
  };

  // Return the collection, with each image styled using the visualization parameters.
  return imageCollection.map(image => image.visualize(visParams));
}

/**
 * RECIPE B: "Wildfire Impact Analysis"
 * Creates a composite visualization showing true-color imagery, thermal hotspots, and a CO plume.
 * @param {RecipeParams} params The parameters for the recipe.
 * @returns {ee.ImageCollection} An Earth Engine ImageCollection ready for video export.
 */
export function wildfireRecipe({ boundingBox, startDate, endDate }: RecipeParams): ee.ImageCollection {
  const trueColorCollection = trueColorRecipe({ boundingBox, startDate, endDate });

  // 1. Thermal Hotspots Layer
  const thermalCollection = ee.ImageCollection('MODIS/061/MOD14A1')
    .filterDate(startDate, endDate)
    .filterBounds(boundingBox);

  const hotspotVis = {
    bands: ['MaxFRP'],
    min: 0,
    max: 100,
    palette: ['#ff0000'] // Bright red for hotspots
  };
  const thermalLayer = thermalCollection.map(img => img.visualize(hotspotVis).updateMask(img.select('MaxFRP').gt(50)));

  // 2. Carbon Monoxide Layer
  const coCollection = ee.ImageCollection('MOPITT/003/MOP02J')
    .filterDate(startDate, endDate)
    .filterBounds(boundingBox)
    .select('retrieved_co_total_column');

  const coVis = {
    min: 2.5e18,
    max: 3.5e18,
    palette: ['#ffff00', '#ff8800', '#ff0000', '#aa0000'] // Yellow to dark red for CO concentration
  };
  const coLayer = coCollection.map(img => img.visualize(coVis).updateMask(img.gt(2.5e18)).resample('bicubic'));

  // 3. Composite the layers
  // We need to mosaic the collections by day and then blend them.
  // This is a simplified approach; a more robust one would involve daily composites.
  // For this project, we blend the entire collections.
  return trueColorCollection.map((image, index) => {
    const blended = image.blend(coLayer.mosaic()).blend(thermalLayer.mosaic());
    return blended;
  });
}

/**
 * RECIPE C: "Hydrological Emergency - Floods" (NDWI)
 * Calculates and visualizes the Normalized Difference Water Index.
 * @param {RecipeParams} params The parameters for the recipe.
 * @returns {ee.ImageCollection} An Earth Engine ImageCollection ready for video export.
 */
export function floodRecipe({ boundingBox, startDate, endDate }: RecipeParams): ee.ImageCollection {
  const imageCollection = ee.ImageCollection('MODIS/061/MOD09GA')
    .filterDate(startDate, endDate)
    .filterBounds(boundingBox);

  const ndwiCollection = imageCollection.map(image => {
    // MODIS Green band is sur_refl_b04, NIR is sur_refl_b02
    return image.normalizedDifference(['sur_refl_b04', 'sur_refl_b02']);
  });

  const ndwiVis = {
    min: -0.2,
    max: 0.8,
    palette: ['#8B4513', '#FFFFFF', '#0000FF'] // Brown -> White -> Blue
  };

  return ndwiCollection.map(img => img.visualize(ndwiVis));
}

/**
 * RECIPE D: "Agricultural Health & Drought" (NDVI)
 * Calculates and visualizes the Normalized Difference Vegetation Index.
 * @param {RecipeParams} params The parameters for the recipe.
 * @returns {ee.ImageCollection} An Earth Engine ImageCollection ready for video export.
 */
export function vegetationRecipe({ boundingBox, startDate, endDate }: RecipeParams): ee.ImageCollection {
  const imageCollection = ee.ImageCollection('MODIS/061/MOD09GA')
    .filterDate(startDate, endDate)
    .filterBounds(boundingBox);

  const ndviCollection = imageCollection.map(image => {
    // MODIS NIR band is sur_refl_b02, Red is sur_refl_b01
    return image.normalizedDifference(['sur_refl_b02', 'sur_refl_b01']);
  });

  const ndviVis = {
    min: -0.2,
    max: 0.9,
    palette: [
      'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718',
      '74A901', '66A000', '529400', '3E8601', '207401', '056201',
      '004C00', '023B01', '012E01', '011D01', '011301'
    ], // Standard vegetation palette
  };

  return ndviCollection.map(img => img.visualize(ndviVis));
}