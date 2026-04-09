"""Translate FEMGeometry operations to Gmsh OCC API calls."""

import math

import gmsh

from backend.common.models.fem.geometry import FEMGeometry


def _eval_param(value, variables: dict[str, float]) -> float:
    """Evaluate a parameter that may be a float or a string expression."""
    if isinstance(value, (int, float)):
        return float(value)
    # String expression — evaluate with variables + math functions
    allowed = {"__builtins__": {}, "math": math}
    allowed.update(variables)
    # Support common math functions without prefix
    allowed.update(
        {
            "sin": math.sin,
            "cos": math.cos,
            "tan": math.tan,
            "sqrt": math.sqrt,
            "pi": math.pi,
            "abs": abs,
        }
    )
    return float(eval(value, allowed))  # noqa: S307


class GmshGeometryTranslator:
    """Replay FEMGeometry operation history using the Gmsh OCC kernel.

    Returns a dict mapping user-assigned IDs to Gmsh entity tags (surfaces).
    """

    def __init__(self):
        self._point_map: dict[str, int] = {}  # user ID → Gmsh point tag
        self._line_map: dict[str, int] = {}  # user ID → Gmsh curve tag
        self._surface_map: dict[str, int] = {}  # user ID → Gmsh surface tag

    def translate(self, geometry: FEMGeometry, variables: dict[str, float]) -> dict[str, int]:
        """Translate all operations and return ID → Gmsh surface tag mapping."""
        for op in geometry.operations:
            handler = self._get_handler(op.type)
            handler(op.params, variables)

        gmsh.model.occ.synchronize()
        return dict(self._surface_map)

    def _get_handler(self, op_type: str):
        handlers = {
            "add_point": self._add_point,
            "add_line": self._add_line,
            "add_arc": self._add_arc,
            "add_surface": self._add_surface,
            "add_rectangle": self._add_rectangle,
            "add_circle": self._add_circle,
            "add_ellipse": self._add_ellipse,
            "add_polygon": self._add_polygon,
            "boolean_union": self._boolean_union,
            "boolean_subtract": self._boolean_subtract,
            "boolean_intersect": self._boolean_intersect,
            "boolean_fragment": self._boolean_fragment,
        }
        if op_type not in handlers:
            raise ValueError(f"Unsupported geometry operation: {op_type}")
        return handlers[op_type]

    # ── Primitive operations ──────────────────────────────────────

    def _add_point(self, params: dict, variables: dict[str, float]):
        x = _eval_param(params["x"], variables)
        y = _eval_param(params["y"], variables)
        mesh_size = _eval_param(params.get("mesh_size", 0.0), variables)
        tag = gmsh.model.occ.addPoint(x, y, 0, meshSize=mesh_size)
        if "id" in params:
            self._point_map[params["id"]] = tag

    def _add_line(self, params: dict, variables: dict[str, float]):
        start_tag = self._point_map[params["start"]]
        end_tag = self._point_map[params["end"]]
        tag = gmsh.model.occ.addLine(start_tag, end_tag)
        if "id" in params:
            self._line_map[params["id"]] = tag

    def _add_arc(self, params: dict, variables: dict[str, float]):
        start_tag = self._point_map[params["start"]]
        center_tag = self._point_map[params["center"]]
        end_tag = self._point_map[params["end"]]
        tag = gmsh.model.occ.addCircleArc(start_tag, center_tag, end_tag)
        if "id" in params:
            self._line_map[params["id"]] = tag

    def _add_surface(self, params: dict, variables: dict[str, float]):
        edge_ids = params["edge_ids"]
        curve_tags = [self._line_map[eid] for eid in edge_ids]
        loop_tag = gmsh.model.occ.addCurveLoop(curve_tags)
        tag = gmsh.model.occ.addPlaneSurface([loop_tag])
        if "id" in params:
            self._surface_map[params["id"]] = tag

    # ── Shape primitives ──────────────────────────────────────────

    def _add_rectangle(self, params: dict, variables: dict[str, float]):
        x = _eval_param(params["x"], variables)
        y = _eval_param(params["y"], variables)
        w = _eval_param(params["width"], variables)
        h = _eval_param(params["height"], variables)
        tag = gmsh.model.occ.addRectangle(x, y, 0, w, h)
        if "id" in params:
            self._surface_map[params["id"]] = tag

    def _add_circle(self, params: dict, variables: dict[str, float]):
        cx = _eval_param(params["cx"], variables)
        cy = _eval_param(params["cy"], variables)
        r = _eval_param(params["radius"], variables)
        tag = gmsh.model.occ.addDisk(cx, cy, 0, r, r)
        if "id" in params:
            self._surface_map[params["id"]] = tag

    def _add_ellipse(self, params: dict, variables: dict[str, float]):
        cx = _eval_param(params["cx"], variables)
        cy = _eval_param(params["cy"], variables)
        rx = _eval_param(params["rx"], variables)
        ry = _eval_param(params["ry"], variables)
        tag = gmsh.model.occ.addDisk(cx, cy, 0, rx, ry)
        if "id" in params:
            self._surface_map[params["id"]] = tag

    def _add_polygon(self, params: dict, variables: dict[str, float]):
        vertices = params["vertices"]
        point_tags = []
        for v in vertices:
            x = _eval_param(v[0], variables)
            y = _eval_param(v[1], variables)
            pt = gmsh.model.occ.addPoint(x, y, 0)
            point_tags.append(pt)

        line_tags = []
        n = len(point_tags)
        for i in range(n):
            l = gmsh.model.occ.addLine(point_tags[i], point_tags[(i + 1) % n])
            line_tags.append(l)

        loop = gmsh.model.occ.addCurveLoop(line_tags)
        tag = gmsh.model.occ.addPlaneSurface([loop])
        if "id" in params:
            self._surface_map[params["id"]] = tag

    # ── Boolean operations ────────────────────────────────────────

    def _boolean_union(self, params: dict, variables: dict[str, float]):
        obj_tag = self._surface_map[params["object"]]
        tool_tag = self._surface_map[params["tool"]]
        out, out_map = gmsh.model.occ.fuse([(2, obj_tag)], [(2, tool_tag)])
        # Update surface map: remove old, add result
        del self._surface_map[params["object"]]
        self._surface_map.pop(params["tool"], None)
        if out:
            self._surface_map[params.get("id", params["object"])] = out[0][1]

    def _boolean_subtract(self, params: dict, variables: dict[str, float]):
        obj_tag = self._surface_map[params["object"]]
        tool_tag = self._surface_map[params["tool"]]
        out, out_map = gmsh.model.occ.cut([(2, obj_tag)], [(2, tool_tag)])
        del self._surface_map[params["object"]]
        self._surface_map.pop(params["tool"], None)
        if out:
            self._surface_map[params.get("id", params["object"])] = out[0][1]

    def _boolean_intersect(self, params: dict, variables: dict[str, float]):
        obj_tag = self._surface_map[params["object"]]
        tool_tag = self._surface_map[params["tool"]]
        out, out_map = gmsh.model.occ.intersect([(2, obj_tag)], [(2, tool_tag)])
        del self._surface_map[params["object"]]
        self._surface_map.pop(params["tool"], None)
        if out:
            self._surface_map[params.get("id", params["object"])] = out[0][1]

    def _boolean_fragment(self, params: dict, variables: dict[str, float]):
        obj_tag = self._surface_map[params["object"]]
        tool_tag = self._surface_map[params["tool"]]
        out, out_map = gmsh.model.occ.fragment([(2, obj_tag)], [(2, tool_tag)])
        del self._surface_map[params["object"]]
        self._surface_map.pop(params["tool"], None)
        # Fragment produces multiple surfaces — store all with auto-generated IDs
        for i, (dim, tag) in enumerate(out):
            frag_id = params.get("id", params["object"])
            key = f"{frag_id}_{i}" if i > 0 else frag_id
            self._surface_map[key] = tag
