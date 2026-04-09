"""Tests for FEM material models."""

from backend.common.models.fem.materials import (
    ConductionMaterial,
    ElectrostaticMaterial,
    Material,
    MaterialProperty,
)


class TestMaterialProperty:
    """Test MaterialProperty model."""

    def test_scalar_property(self):
        prop = MaterialProperty(name="permittivity", value=11.7)
        assert prop.value == 11.7
        assert prop.is_tensor is False

    def test_tensor_property(self):
        tensor = [[11.7, 0.0], [0.0, 11.7]]
        prop = MaterialProperty(name="permittivity", value=tensor, is_tensor=True)
        assert prop.is_tensor is True
        assert prop.value == tensor

    def test_anisotropic_tensor(self):
        tensor = [[11.7, 0.5], [0.5, 9.8]]
        prop = MaterialProperty(name="permittivity", value=tensor, is_tensor=True)
        assert prop.value[0][1] == 0.5

    def test_property_with_unit(self):
        prop = MaterialProperty(name="conductivity", value=5.96e7, unit="S/m")
        assert prop.unit == "S/m"

    def test_serialization_round_trip(self):
        prop = MaterialProperty(name="permittivity", value=11.7, unit="F/m")
        data = prop.model_dump()
        restored = MaterialProperty.model_validate(data)
        assert restored == prop

    def test_tensor_serialization_round_trip(self):
        tensor = [[11.7, 0.0], [0.0, 9.8]]
        prop = MaterialProperty(name="permittivity", value=tensor, is_tensor=True)
        data = prop.model_dump()
        restored = MaterialProperty.model_validate(data)
        assert restored.value == tensor


class TestMaterial:
    """Test generic Material model."""

    def test_material_with_properties(self):
        mat = Material(
            id="silicon",
            name="Silicon",
            properties={
                "permittivity": MaterialProperty(name="permittivity", value=11.7),
            },
        )
        assert mat.id == "silicon"
        assert mat.name == "Silicon"
        assert mat.properties["permittivity"].value == 11.7

    def test_material_multiple_properties(self):
        mat = Material(
            id="copper",
            name="Copper",
            properties={
                "conductivity": MaterialProperty(name="conductivity", value=5.96e7, unit="S/m"),
                "permeability": MaterialProperty(name="permeability", value=1.0),
            },
        )
        assert len(mat.properties) == 2

    def test_material_empty_properties(self):
        mat = Material(id="vacuum", name="Vacuum", properties={})
        assert len(mat.properties) == 0

    def test_json_round_trip(self):
        mat = Material(
            id="fr4",
            name="FR-4",
            properties={
                "permittivity": MaterialProperty(name="permittivity", value=4.4),
            },
        )
        json_str = mat.model_dump_json()
        restored = Material.model_validate_json(json_str)
        assert restored == mat


class TestElectrostaticMaterial:
    """Test ElectrostaticMaterial model."""

    def test_isotropic_permittivity(self):
        mat = ElectrostaticMaterial(id="silicon", name="Silicon", relative_permittivity=11.7)
        assert mat.relative_permittivity == 11.7

    def test_anisotropic_permittivity(self):
        tensor = [[11.7, 0.0], [0.0, 9.8]]
        mat = ElectrostaticMaterial(id="aniso", name="Anisotropic", relative_permittivity=tensor)
        assert mat.relative_permittivity == tensor

    def test_vacuum_permittivity(self):
        mat = ElectrostaticMaterial(id="vacuum", name="Vacuum", relative_permittivity=1.0)
        assert mat.relative_permittivity == 1.0

    def test_serialization_round_trip(self):
        mat = ElectrostaticMaterial(id="test", name="Test", relative_permittivity=4.5)
        data = mat.model_dump()
        restored = ElectrostaticMaterial.model_validate(data)
        assert restored == mat


class TestConductionMaterial:
    """Test ConductionMaterial model."""

    def test_isotropic_conductivity(self):
        mat = ConductionMaterial(id="copper", name="Copper", conductivity=5.96e7)
        assert mat.conductivity == 5.96e7

    def test_anisotropic_conductivity(self):
        tensor = [[5.96e7, 0.0], [0.0, 3.5e7]]
        mat = ConductionMaterial(id="aniso", name="Anisotropic", conductivity=tensor)
        assert mat.conductivity == tensor

    def test_serialization_round_trip(self):
        mat = ConductionMaterial(id="al", name="Aluminum", conductivity=3.5e7)
        data = mat.model_dump()
        restored = ConductionMaterial.model_validate(data)
        assert restored == mat
