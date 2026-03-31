"""Tests for the safe expression evaluator."""

import math

import pytest

from backend.common.utils.expressions import (
    ExpressionError,
    detect_circular_dependencies,
    evaluate_expression,
    get_expression_variables,
    parse_numeric_or_expression,
)


class TestBasicArithmetic:
    """Test basic numeric and arithmetic expressions."""

    def test_integer_literal(self):
        assert evaluate_expression("42") == 42.0

    def test_float_literal(self):
        assert evaluate_expression("3.14") == pytest.approx(3.14)

    def test_scientific_notation(self):
        assert evaluate_expression("300e6") == pytest.approx(300e6)

    def test_negative_scientific_notation(self):
        assert evaluate_expression("1e-3") == pytest.approx(1e-3)

    def test_addition(self):
        assert evaluate_expression("2 + 3") == 5.0

    def test_subtraction(self):
        assert evaluate_expression("10 - 7") == 3.0

    def test_multiplication(self):
        assert evaluate_expression("4 * 5") == 20.0

    def test_division(self):
        assert evaluate_expression("10 / 4") == 2.5

    def test_power(self):
        assert evaluate_expression("2 ** 10") == 1024.0

    def test_floor_division(self):
        assert evaluate_expression("7 // 2") == 3.0

    def test_modulo(self):
        assert evaluate_expression("7 % 3") == 1.0

    def test_unary_negative(self):
        assert evaluate_expression("-5") == -5.0

    def test_unary_positive(self):
        assert evaluate_expression("+5") == 5.0

    def test_operator_precedence(self):
        assert evaluate_expression("2 + 3 * 4") == 14.0

    def test_parentheses(self):
        assert evaluate_expression("(2 + 3) * 4") == 20.0

    def test_nested_parentheses(self):
        assert evaluate_expression("((2 + 3) * (4 - 1))") == 15.0

    def test_complex_expression(self):
        assert evaluate_expression("2 * 3 + 4 / 2 - 1") == 7.0


class TestMathFunctions:
    """Test allowed math functions."""

    def test_sin(self):
        assert evaluate_expression("sin(0)") == pytest.approx(0.0)

    def test_cos(self):
        assert evaluate_expression("cos(0)") == pytest.approx(1.0)

    def test_sin_pi(self):
        assert evaluate_expression("sin(pi)") == pytest.approx(0.0, abs=1e-15)

    def test_cos_pi(self):
        assert evaluate_expression("cos(pi)") == pytest.approx(-1.0)

    def test_tan(self):
        assert evaluate_expression("tan(0)") == pytest.approx(0.0)

    def test_sqrt(self):
        assert evaluate_expression("sqrt(16)") == 4.0

    def test_log_e(self):
        assert evaluate_expression("log(e)") == pytest.approx(1.0)

    def test_log10(self):
        assert evaluate_expression("log10(1000)") == pytest.approx(3.0)

    def test_log2(self):
        assert evaluate_expression("log2(8)") == pytest.approx(3.0)

    def test_exp(self):
        assert evaluate_expression("exp(0)") == 1.0

    def test_abs_positive(self):
        assert evaluate_expression("abs(5)") == 5.0

    def test_abs_negative(self):
        assert evaluate_expression("abs(-5)") == 5.0

    def test_min_two_args(self):
        assert evaluate_expression("min(3, 7)") == 3.0

    def test_max_two_args(self):
        assert evaluate_expression("max(3, 7)") == 7.0

    def test_pow_function(self):
        assert evaluate_expression("pow(2, 10)") == 1024.0

    def test_round_function(self):
        assert evaluate_expression("round(3.7)") == 4.0

    def test_degrees(self):
        assert evaluate_expression("degrees(pi)") == pytest.approx(180.0)

    def test_radians(self):
        assert evaluate_expression("radians(180)") == pytest.approx(math.pi)

    def test_atan2(self):
        assert evaluate_expression("atan2(1, 1)") == pytest.approx(math.pi / 4)

    def test_asin(self):
        assert evaluate_expression("asin(1)") == pytest.approx(math.pi / 2)

    def test_acos(self):
        assert evaluate_expression("acos(1)") == pytest.approx(0.0)

    def test_nested_functions(self):
        assert evaluate_expression("sqrt(abs(-16))") == 4.0

    def test_function_with_expression_arg(self):
        assert evaluate_expression("sin(pi / 2)") == pytest.approx(1.0)


class TestBuiltinConstants:
    """Test built-in physical constants."""

    def test_C_0(self):
        assert evaluate_expression("C_0") == pytest.approx(299792458.0)

    def test_MU_0(self):
        assert evaluate_expression("MU_0") == pytest.approx(4 * math.pi * 1e-7)

    def test_EPSILON_0(self):
        assert evaluate_expression("EPSILON_0") == pytest.approx(8.854187817e-12)

    def test_Z_0(self):
        assert evaluate_expression("Z_0") == pytest.approx(376.73031346177)

    def test_pi(self):
        assert evaluate_expression("pi") == pytest.approx(math.pi)

    def test_e(self):
        assert evaluate_expression("e") == pytest.approx(math.e)

    def test_wavelength_expression(self):
        """Test computing wavelength at 300 MHz."""
        result = evaluate_expression("C_0 / 300e6")
        expected = 299792458.0 / 300e6
        assert result == pytest.approx(expected)

    def test_quarter_wavelength(self):
        """Test computing quarter-wavelength at 300 MHz."""
        result = evaluate_expression("C_0 / 300e6 / 4")
        expected = 299792458.0 / 300e6 / 4
        assert result == pytest.approx(expected)


class TestVariableReferences:
    """Test expressions that reference user-defined variables."""

    def test_simple_variable(self):
        assert evaluate_expression("x", {"x": 5.0}) == 5.0

    def test_variable_in_expression(self):
        assert evaluate_expression("x + 1", {"x": 5.0}) == 6.0

    def test_multiple_variables(self):
        result = evaluate_expression("a * b + c", {"a": 2, "b": 3, "c": 4})
        assert result == 10.0

    def test_variable_with_constant(self):
        result = evaluate_expression("C_0 / freq", {"freq": 300e6})
        assert result == pytest.approx(299792458.0 / 300e6)

    def test_variable_in_function(self):
        result = evaluate_expression("sqrt(x)", {"x": 25.0})
        assert result == 5.0

    def test_variable_overwrites_nothing(self):
        """User variables don't override built-in constants."""
        result = evaluate_expression("x + pi", {"x": 1.0})
        assert result == pytest.approx(1.0 + math.pi)

    def test_antenna_wavelength_calculation(self):
        """Realistic antenna design expression."""
        variables = {"freq": 300e6}
        wavelength = evaluate_expression("C_0 / freq", variables)
        arm = evaluate_expression("C_0 / freq / 4", variables)
        assert wavelength == pytest.approx(0.9993, rel=1e-3)
        assert arm == pytest.approx(0.2498, rel=1e-3)


class TestErrorHandling:
    """Test error handling for invalid expressions."""

    def test_empty_expression(self):
        with pytest.raises(ExpressionError, match="Empty expression"):
            evaluate_expression("")

    def test_whitespace_only(self):
        with pytest.raises(ExpressionError, match="Empty expression"):
            evaluate_expression("   ")

    def test_syntax_error(self):
        with pytest.raises(ExpressionError, match="Syntax error"):
            evaluate_expression("2 +")

    def test_unknown_variable(self):
        with pytest.raises(ExpressionError, match="Unknown variable 'x'"):
            evaluate_expression("x + 1")

    def test_division_by_zero(self):
        with pytest.raises(ExpressionError, match="Division by zero"):
            evaluate_expression("1 / 0")

    def test_unknown_function(self):
        with pytest.raises(ExpressionError, match="Unknown function"):
            evaluate_expression("eval('bad')")

    def test_function_used_as_variable(self):
        with pytest.raises(ExpressionError, match="is a function"):
            evaluate_expression("sin + 1")

    def test_string_literal_rejected(self):
        with pytest.raises(ExpressionError, match="Unsupported constant type"):
            evaluate_expression("'hello'")

    def test_keyword_args_rejected(self):
        with pytest.raises(ExpressionError, match="Keyword arguments"):
            evaluate_expression("round(3.14, ndigits=1)")

    def test_attribute_access_rejected(self):
        with pytest.raises(ExpressionError, match="simple function calls"):
            evaluate_expression("os.system('ls')")

    def test_import_rejected(self):
        with pytest.raises(ExpressionError, match="simple function calls"):
            evaluate_expression("__import__('os').system('ls')")

    def test_list_rejected(self):
        with pytest.raises(ExpressionError, match="Unsupported syntax"):
            evaluate_expression("[1, 2, 3]")

    def test_dict_rejected(self):
        with pytest.raises(ExpressionError, match="Unsupported syntax"):
            evaluate_expression("{'a': 1}")

    def test_lambda_rejected(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("lambda x: x")

    def test_sqrt_negative_raises(self):
        with pytest.raises(ExpressionError, match="Error calling sqrt"):
            evaluate_expression("sqrt(-1)")


class TestParseNumericOrExpression:
    """Test the combined numeric/expression parser."""

    def test_float_passthrough(self):
        assert parse_numeric_or_expression(3.14) == pytest.approx(3.14)

    def test_int_passthrough(self):
        assert parse_numeric_or_expression(42) == 42.0

    def test_string_expression(self):
        assert parse_numeric_or_expression("2 + 3") == 5.0

    def test_string_with_variables(self):
        assert parse_numeric_or_expression("x * 2", {"x": 5}) == 10.0

    def test_numeric_string(self):
        assert parse_numeric_or_expression("3.14") == pytest.approx(3.14)

    def test_scientific_string(self):
        assert parse_numeric_or_expression("300e6") == pytest.approx(300e6)


class TestGetExpressionVariables:
    """Test variable name extraction from expressions."""

    def test_no_variables(self):
        assert get_expression_variables("2 + 3") == set()

    def test_single_variable(self):
        assert get_expression_variables("x + 1") == {"x"}

    def test_multiple_variables(self):
        assert get_expression_variables("a * b + c") == {"a", "b", "c"}

    def test_excludes_constants(self):
        assert get_expression_variables("pi + C_0") == set()

    def test_excludes_functions(self):
        assert get_expression_variables("sin(x)") == {"x"}

    def test_mixed(self):
        result = get_expression_variables("freq * pi + sin(phase)")
        assert result == {"freq", "phase"}

    def test_empty_expression(self):
        assert get_expression_variables("") == set()

    def test_invalid_expression(self):
        assert get_expression_variables("2 +") == set()


class TestCircularDependencyDetection:
    """Test circular dependency detection in variable lists."""

    def test_no_cycle(self):
        variables = [
            ("a", "1"),
            ("b", "a + 1"),
            ("c", "b * 2"),
        ]
        assert detect_circular_dependencies(variables) is None

    def test_self_reference(self):
        variables = [("a", "a + 1")]
        cycle = detect_circular_dependencies(variables)
        assert cycle is not None
        assert "a" in cycle

    def test_two_node_cycle(self):
        variables = [
            ("a", "b + 1"),
            ("b", "a + 1"),
        ]
        cycle = detect_circular_dependencies(variables)
        assert cycle is not None

    def test_three_node_cycle(self):
        variables = [
            ("a", "b + 1"),
            ("b", "c + 1"),
            ("c", "a + 1"),
        ]
        cycle = detect_circular_dependencies(variables)
        assert cycle is not None

    def test_no_cycle_with_constants(self):
        """References to constants don't create cycles."""
        variables = [
            ("freq", "300e6"),
            ("wavelength", "C_0 / freq"),
            ("arm", "wavelength / 4"),
        ]
        assert detect_circular_dependencies(variables) is None

    def test_independent_variables(self):
        variables = [
            ("a", "1"),
            ("b", "2"),
            ("c", "3"),
        ]
        assert detect_circular_dependencies(variables) is None

    def test_partial_cycle_in_larger_graph(self):
        variables = [
            ("a", "1"),
            ("b", "a + 1"),
            ("c", "d + 1"),
            ("d", "c + 1"),
        ]
        cycle = detect_circular_dependencies(variables)
        assert cycle is not None
        assert "c" in cycle or "d" in cycle


class TestSecurityHardening:
    """Test that dangerous operations are blocked."""

    def test_no_eval(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("eval('1+1')")

    def test_no_exec(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("exec('print(1)')")

    def test_no_builtins(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("__builtins__")

    def test_no_class_access(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("().__class__")

    def test_no_getattr(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("getattr(1, '__class__')")

    def test_no_compile(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("compile('1', '', 'eval')")

    def test_no_globals(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("globals()")

    def test_no_method_calls(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("'hello'.upper()")

    def test_no_subscript(self):
        with pytest.raises(ExpressionError):
            evaluate_expression("[1,2,3][0]")


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_very_large_number(self):
        result = evaluate_expression("1e300")
        assert result == 1e300

    def test_very_small_number(self):
        result = evaluate_expression("1e-300")
        assert result == pytest.approx(1e-300)

    def test_negative_zero(self):
        result = evaluate_expression("-0.0")
        assert result == 0.0

    def test_inf_constant(self):
        result = evaluate_expression("inf")
        assert result == math.inf

    def test_deeply_nested_expression(self):
        expr = "((((((1 + 2) * 3) - 4) / 5) ** 2) + 1)"
        result = evaluate_expression(expr)
        assert isinstance(result, float)

    def test_whitespace_handling(self):
        assert evaluate_expression("  2  +  3  ") == 5.0

    def test_multiple_unary_minus(self):
        assert evaluate_expression("--5") == 5.0
