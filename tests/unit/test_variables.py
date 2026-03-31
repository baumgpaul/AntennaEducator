"""Tests for the Variable and VariableContext models."""

import math

import pytest
from pydantic import ValidationError

from backend.common.models.variables import (
    Variable,
    VariableContext,
    default_variable_context,
)
from backend.common.utils.expressions import (
    CircularDependencyError,
    ExpressionError,
)


class TestVariable:
    """Test the Variable Pydantic model."""

    def test_basic_variable(self):
        v = Variable(name="freq", expression="300e6")
        assert v.name == "freq"
        assert v.expression == "300e6"

    def test_variable_with_unit(self):
        v = Variable(name="freq", expression="300e6", unit="Hz")
        assert v.unit == "Hz"

    def test_variable_with_description(self):
        v = Variable(
            name="freq",
            expression="300e6",
            description="Operating frequency",
        )
        assert v.description == "Operating frequency"

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError, match="empty"):
            Variable(name="", expression="1")

    def test_whitespace_name_rejected(self):
        with pytest.raises(ValidationError, match="empty"):
            Variable(name="   ", expression="1")

    def test_invalid_identifier_rejected(self):
        with pytest.raises(ValidationError, match="not a valid identifier"):
            Variable(name="123abc", expression="1")

    def test_name_with_space_rejected(self):
        with pytest.raises(ValidationError, match="not a valid identifier"):
            Variable(name="my var", expression="1")

    def test_builtin_constant_name_rejected(self):
        with pytest.raises(ValidationError, match="built-in constant"):
            Variable(name="C_0", expression="1")

    def test_pi_name_rejected(self):
        with pytest.raises(ValidationError, match="built-in constant"):
            Variable(name="pi", expression="1")

    def test_empty_expression_rejected(self):
        with pytest.raises(ValidationError, match="empty"):
            Variable(name="x", expression="")

    def test_whitespace_expression_trimmed(self):
        v = Variable(name="x", expression="  300e6  ")
        assert v.expression == "300e6"

    def test_underscore_name(self):
        v = Variable(name="arm_length", expression="1")
        assert v.name == "arm_length"

    def test_name_starting_with_underscore(self):
        v = Variable(name="_private", expression="1")
        assert v.name == "_private"

    def test_serialization_roundtrip(self):
        v = Variable(
            name="freq",
            expression="300e6",
            unit="Hz",
            description="Freq",
        )
        data = v.model_dump()
        v2 = Variable(**data)
        assert v2.name == v.name
        assert v2.expression == v.expression
        assert v2.unit == v.unit


class TestVariableContext:
    """Test the VariableContext model and evaluation."""

    def test_empty_context(self):
        ctx = VariableContext()
        result = ctx.evaluate()
        assert result == {}

    def test_single_numeric_variable(self):
        ctx = VariableContext(variables=[Variable(name="x", expression="42")])
        result = ctx.evaluate()
        assert result == {"x": 42.0}

    def test_variable_referencing_another(self):
        ctx = VariableContext(
            variables=[
                Variable(name="a", expression="10"),
                Variable(name="b", expression="a * 2"),
            ]
        )
        result = ctx.evaluate()
        assert result["a"] == 10.0
        assert result["b"] == 20.0

    def test_chain_of_three(self):
        ctx = VariableContext(
            variables=[
                Variable(name="freq", expression="300e6"),
                Variable(name="wavelength", expression="C_0 / freq"),
                Variable(name="arm", expression="wavelength / 4"),
            ]
        )
        result = ctx.evaluate()
        expected_wl = 299792458.0 / 300e6
        assert result["freq"] == pytest.approx(300e6)
        assert result["wavelength"] == pytest.approx(expected_wl)
        assert result["arm"] == pytest.approx(expected_wl / 4)

    def test_uses_builtin_constants(self):
        ctx = VariableContext(variables=[Variable(name="x", expression="pi * 2")])
        result = ctx.evaluate()
        assert result["x"] == pytest.approx(2 * math.pi)

    def test_extra_constants(self):
        ctx = VariableContext(variables=[Variable(name="x", expression="ext + 1")])
        result = ctx.evaluate(extra_constants={"ext": 10.0})
        assert result["x"] == 11.0

    def test_duplicate_names_rejected(self):
        with pytest.raises(ValidationError, match="Duplicate variable name"):
            VariableContext(
                variables=[
                    Variable(name="x", expression="1"),
                    Variable(name="x", expression="2"),
                ]
            )

    def test_circular_dependency_detected(self):
        ctx = VariableContext(
            variables=[
                Variable(name="a", expression="b + 1"),
                Variable(name="b", expression="a + 1"),
            ]
        )
        with pytest.raises(CircularDependencyError):
            ctx.evaluate()

    def test_self_referencing_variable(self):
        ctx = VariableContext(variables=[Variable(name="x", expression="x + 1")])
        with pytest.raises(CircularDependencyError):
            ctx.evaluate()

    def test_invalid_expression_raises(self):
        ctx = VariableContext(variables=[Variable(name="x", expression="2 +")])
        with pytest.raises(ExpressionError):
            ctx.evaluate()

    def test_forward_reference_fails(self):
        """Variable N cannot reference variable N+1."""
        ctx = VariableContext(
            variables=[
                Variable(name="a", expression="b + 1"),
                Variable(name="b", expression="10"),
            ]
        )
        # 'a' references 'b' which isn't yet evaluated
        # But no circular dep — depends on eval order
        # Our top-down evaluation means 'a' can't see 'b' yet
        with pytest.raises(ExpressionError, match="Unknown variable 'b'"):
            ctx.evaluate()


class TestVariableContextSafeEvaluate:
    """Test the safe evaluation method that returns errors instead of raising."""

    def test_all_valid(self):
        ctx = VariableContext(
            variables=[
                Variable(name="a", expression="10"),
                Variable(name="b", expression="a * 2"),
            ]
        )
        result = ctx.evaluate_safe()
        assert result["a"] == 10.0
        assert result["b"] == 20.0

    def test_error_in_later_variable(self):
        ctx = VariableContext(
            variables=[
                Variable(name="a", expression="10"),
                Variable(name="b", expression="2 +"),
            ]
        )
        result = ctx.evaluate_safe()
        assert result["a"] == 10.0
        assert isinstance(result["b"], str)

    def test_cascade_error(self):
        """If variable fails, later variables referencing it also fail."""
        ctx = VariableContext(
            variables=[
                Variable(name="a", expression="bad_syntax_here ++"),
                Variable(name="b", expression="a * 2"),
            ]
        )
        result = ctx.evaluate_safe()
        assert isinstance(result["a"], str)
        assert isinstance(result["b"], str)


class TestDefaultVariableContext:
    """Test the default_variable_context factory."""

    def test_has_freq(self):
        ctx = default_variable_context()
        result = ctx.evaluate()
        assert "freq" in result
        assert result["freq"] == pytest.approx(300e6)

    def test_has_wavelength(self):
        ctx = default_variable_context()
        result = ctx.evaluate()
        assert "wavelength" in result
        expected = 299792458.0 / 300e6
        assert result["wavelength"] == pytest.approx(expected)

    def test_serialization_roundtrip(self):
        ctx = default_variable_context()
        data = ctx.model_dump()
        ctx2 = VariableContext(**data)
        result = ctx2.evaluate()
        assert result["freq"] == pytest.approx(300e6)


class TestVariableContextWithAntennaExpressions:
    """Test realistic antenna design variable chains."""

    def test_dipole_design(self):
        """Typical half-wave dipole parameterization."""
        ctx = VariableContext(
            variables=[
                Variable(name="freq", expression="300e6"),
                Variable(name="wl", expression="C_0 / freq"),
                Variable(name="arm", expression="wl / 4"),
                Variable(name="gap", expression="wl / 100"),
                Variable(name="wire_r", expression="1e-3"),
            ]
        )
        result = ctx.evaluate()
        wl = 299792458.0 / 300e6
        assert result["arm"] == pytest.approx(wl / 4)
        assert result["gap"] == pytest.approx(wl / 100)
        assert result["wire_r"] == pytest.approx(1e-3)

    def test_loop_design(self):
        """Parameterized loop antenna."""
        ctx = VariableContext(
            variables=[
                Variable(name="freq", expression="1e9"),
                Variable(name="wl", expression="C_0 / freq"),
                Variable(name="circumference", expression="wl / 3"),
                Variable(name="loop_r", expression="circumference / (2 * pi)"),
            ]
        )
        result = ctx.evaluate()
        wl = 299792458.0 / 1e9
        circ = wl / 3
        assert result["loop_r"] == pytest.approx(circ / (2 * math.pi))

    def test_impedance_matching_variables(self):
        """Variables for impedance matching network."""
        ctx = VariableContext(
            variables=[
                Variable(name="freq", expression="300e6"),
                Variable(name="Z_in", expression="73"),
                Variable(name="Z_line", expression="50"),
                Variable(name="reflection", expression="(Z_in - Z_line) / (Z_in + Z_line)"),
            ]
        )
        result = ctx.evaluate()
        assert result["reflection"] == pytest.approx((73 - 50) / (73 + 50))
