import unittest

from app.satellite_sources import parse_gibs_capabilities


class NasaGibsCapabilitiesTests(unittest.TestCase):
    def test_extracts_live_wmts_layer_and_template(self) -> None:
        xml = """<?xml version="1.0"?>
        <Capabilities xmlns="http://www.opengis.net/wmts/1.0"
          xmlns:ows="http://www.opengis.net/ows/1.1">
          <Contents>
            <Layer>
              <ows:Title>VIIRS Corrected Reflectance True Color</ows:Title>
              <ows:Identifier>VIIRS_SNPP_CorrectedReflectance_TrueColor</ows:Identifier>
              <Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-11-07</Default><Value>2026-11-06/2026-11-07/P1D</Value></Dimension>
              <Format>image/jpeg</Format>
              <ResourceURL format="image/jpeg" resourceType="tile"
                template="https://example.test/{TileMatrix}/{TileRow}/{TileCol}.jpg"/>
            </Layer>
          </Contents>
        </Capabilities>"""
        layers = parse_gibs_capabilities(xml)
        self.assertEqual(len(layers), 1)
        self.assertEqual(layers[0]["id"], "VIIRS_SNPP_CorrectedReflectance_TrueColor")
        self.assertEqual(layers[0]["title"], "VIIRS Corrected Reflectance True Color")
        self.assertEqual(layers[0]["formats"], ["image/jpeg"])
        self.assertIn("{TileMatrix}", layers[0]["tile_templates"][0])
        self.assertEqual(layers[0]["default_time"], "2026-11-07")
        self.assertEqual(layers[0]["time_extent"], "2026-11-06/2026-11-07/P1D")

    def test_missing_contents_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            parse_gibs_capabilities("<Capabilities />")


if __name__ == "__main__":
    unittest.main()
