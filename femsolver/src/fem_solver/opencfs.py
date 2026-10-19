"""Export an electrostatics model to openCFS (simulation XML + material XML).

The mesh comes from fem_mesher as a Gmsh MSH 2.2 file: openCFS reads it
directly and names its regions after the Gmsh physical names, which are our
domain and boundary names. Format reference: share/xml/CFS-Simulation in
gitlab.com/openCFS/cfs and the Electrostatics cases of its test suite.
"""

import ast
from xml.sax.saxutils import quoteattr

from fem_mesher.expressions import evaluate, evaluate_parameters

from .problem import (
    EPSILON_0,
    ChargeDensity,
    Electrostatics,
    Ground,
    Potential,
    SurfaceChargeDensity,
)

_OPS = {ast.Add: "+", ast.Sub: "-", ast.Mult: "*", ast.Div: "/", ast.Pow: "^"}


def _expression(value, names: dict[str, float]) -> str:
    """openCFS value: a number if constant, else the expression in its syntax (^ for powers)."""
    try:
        return repr(evaluate(value, names))
    except ValueError:
        pass  # depends on x, y: keep it as an expression
    return _unparse(ast.parse(str(value).strip(), mode="eval").body)


def _unparse(node: ast.AST) -> str:
    if isinstance(node, ast.Constant):
        return repr(node.value)
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.BinOp):
        return f"({_unparse(node.left)}{_OPS[type(node.op)]}{_unparse(node.right)})"
    if isinstance(node, ast.UnaryOp):
        return (
            f"(-{_unparse(node.operand)})"
            if isinstance(node.op, ast.USub)
            else _unparse(node.operand)
        )
    if isinstance(node, ast.Call):
        return f"{node.func.id}({','.join(_unparse(a) for a in node.args)})"
    raise ValueError(f"Cannot export expression {ast.dump(node)}")


def export(
    problem: Electrostatics,
    domains: list[str],
    boundaries: list[str],
    mesh_file: str = "model.msh",
) -> dict[str, str]:
    """{"simulation.xml": ..., "mat.xml": ...} for openCFS (2D plane, static)."""
    names = evaluate_parameters(problem.parameters)
    q = quoteattr

    variables = "".join(f"\n      <var name={q(k)} value={q(repr(v))}/>" for k, v in names.items())
    regions = "".join(
        f"\n      <region name={q(d)} material={q(problem.materials[d].name)}/>" for d in domains
    )
    surf = "".join(f"\n      <surfRegion name={q(b)}/>" for b in boundaries)
    pde_regions = "".join(f"\n          <region name={q(d)}/>" for d in domains)

    loads = []
    for bc in problem.boundary_conditions:
        if isinstance(bc, Ground):
            loads.append(f"<ground name={q(bc.boundary)}/>")
        elif isinstance(bc, Potential):
            loads.append(
                f"<potential name={q(bc.boundary)} value={q(_expression(bc.value, names))}/>"
            )
        elif isinstance(bc, SurfaceChargeDensity):
            loads.append(
                f"<chargeDensity name={q(bc.boundary)} value={q(_expression(bc.value, names))}/>"
            )
    for src in problem.sources:
        if isinstance(src, ChargeDensity):
            loads.append(
                f"<chargeDensity name={q(src.domain)} value={q(_expression(src.value, names))}/>"
            )
    bcs = "".join(f"\n          {line}" for line in loads)
    charged = [
        bc.boundary for bc in problem.boundary_conditions if isinstance(bc, (Ground, Potential))
    ]
    charge_results = "".join(f"\n              <surfRegion name={q(b)}/>" for b in charged)

    simulation = f"""<?xml version="1.0"?>
<cfsSimulation xmlns="http://www.cfs++.org/simulation">
  <!-- Exported from FEM Studio (AntennaEducator): 2D plane electrostatics -->
  <fileFormats>
    <input>
      <gmsh fileName={q(mesh_file)}/>
    </input>
    <output>
      <hdf5/>
      <text/>
    </output>
    <materialData file="mat.xml" format="xml"/>
  </fileFormats>

  <domain geometryType="plane" depth2dPlane={q(repr(problem.depth))}>
    <variableList>{variables}
    </variableList>
    <regionList>{regions}
    </regionList>
    <surfRegionList>{surf}
    </surfRegionList>
  </domain>

  <sequenceStep>
    <analysis>
      <static/>
    </analysis>
    <pdeList>
      <electrostatic>
        <regionList>{pde_regions}
        </regionList>
        <bcsAndLoads>{bcs}
        </bcsAndLoads>
        <storeResults>
          <nodeResult type="elecPotential">
            <allRegions/>
          </nodeResult>
          <elemResult type="elecFieldIntensity">
            <allRegions/>
          </elemResult>
          <regionResult type="elecEnergy">
            <allRegions/>
          </regionResult>{f'''
          <surfRegionResult type="elecCharge">
            <surfRegionList>{charge_results}
            </surfRegionList>
          </surfRegionResult>''' if charged else ""}
        </storeResults>
      </electrostatic>
    </pdeList>
  </sequenceStep>
</cfsSimulation>
"""

    materials = {problem.materials[d].name: problem.materials[d] for d in domains}
    blocks = []
    for name, m in materials.items():
        e = EPSILON_0 * m.relative_permittivity
        blocks.append(
            f"""  <material name={q(name)}>
    <electric>
      <permittivity>
        <linear>
          <tensor dim1="3" dim2="3">
            <real>
              {e:.6E} 0.00000E+00 0.00000E+00
              0.00000E+00 {e:.6E} 0.00000E+00
              0.00000E+00 0.00000E+00 {e:.6E}
            </real>
          </tensor>
        </linear>
      </permittivity>
    </electric>
  </material>"""
        )
    mat = (
        '<?xml version="1.0"?>\n<cfsMaterialDataBase xmlns="http://www.cfs++.org/material">\n'
        + "\n".join(blocks)
        + "\n</cfsMaterialDataBase>\n"
    )
    return {"simulation.xml": simulation, "mat.xml": mat}
