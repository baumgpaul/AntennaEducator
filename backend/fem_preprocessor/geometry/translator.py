"""Translate FEMGeometry operations to Gmsh OCC API calls.

Supports two parameter conventions for shape primitives:
  - Legacy/backend format: ``x, y`` (corner) for rectangles; ``cx, cy`` for circles/ellipses.
  - Frontend format: ``center_x, center_y`` for all shapes (produced by the canvas drawing tools).

Both are accepted transparently so tests and frontend can co-exist without change.
"""

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


def _get_entity_key(params: dict) -> str | None:
    """Return the entity ID key, supporting both 'id' and 'tag' conventions."""
    return params.get("id") or params.get("tag") or None


class GmshGeometryTranslator:
    """Replay FEMGeometry operation history using the Gmsh OCC kernel.

    Returns a dict mapping user-assigned IDs to Gmsh entity tags (surfaces).
    Also creates 1D and 2D physical groups named after geometry edge/surface IDs
    so the solver can match boundary conditions and materials by name.
    """

    def __init__(self):
        self._point_map: dict[str, int] = {}  # user ID → Gmsh point tag
        self._line_map: dict[str, int] = {}  # user ID → Gmsh curve tag
        self._surface_map: dict[str, int] = {}  # user ID → Gmsh surface tag
        self._surface_edge_names: dict[str, list[str]] = {}  # surface key → edge IDs

    def translate(self, geometry: FEMGeometry, variables: dict[str, float]) -> dict[str, int]:
        """Translate all operations and return ID → Gmsh surface tag mapping."""
        for op in geometry.operations:
            handler = self._get_handler(op.type)
            handler(op.params, variables)

        gmsh.model.occ.synchronize()
        self._create_physical_groups()
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
        key = _get_entity_key(params)
        if key:
            self._point_map[key] = tag

    def _add_line(self, params: dict, variables: dict[str, float]):
        """Add a line.

        Supports two modes:
        - Point-ID reference: ``start`` and ``end`` are IDs registered via ``add_point``.
        - Direct coordinates: ``start_x, start_y, end_x, end_y`` (used by the canvas drawing tool).
        """
        if "start" in params:
            start_gmsh_tag = self._point_map[params["start"]]
            end_gmsh_tag = self._point_map[params["end"]]
        else:
            sx = _eval_param(params["start_x"], variables)
            sy = _eval_param(params["start_y"], variables)
            ex = _eval_param(params["end_x"], variables)
            ey = _eval_param(params["end_y"], variables)
            start_gmsh_tag = gmsh.model.occ.addPoint(sx, sy, 0)
            end_gmsh_tag = gmsh.model.occ.addPoint(ex, ey, 0)
        tag = gmsh.model.occ.addLine(start_gmsh_tag, end_gmsh_tag)
        key = _get_entity_key(params)
        if key:
            self._line_map[key] = tag

    def _add_arc(self, params: dict, variables: dict[str, float]):
        """Add a circle arc (< π).

        Supports two modes:
        - Point-ID reference: ``start``, ``center``, ``end`` are registered point IDs.
        - Direct coordinates: ``start_x/y``, ``center_x/y``, ``end_x/y``.
        """
        if "start" in params:
            start_gmsh_tag = self._point_map[params["start"]]
            center_gmsh_tag = self._point_map[params["center"]]
            end_gmsh_tag = self._point_map[params["end"]]
        else:
            sx = _eval_param(params["start_x"], variables)
            sy = _eval_param(params["start_y"], variables)
            cx = _eval_param(params["center_x"], variables)
            cy = _eval_param(params["center_y"], variables)
            ex = _eval_param(params["end_x"], variables)
            ey = _eval_param(params["end_y"], variables)
            start_gmsh_tag = gmsh.model.occ.addPoint(sx, sy, 0)
            center_gmsh_tag = gmsh.model.occ.addPoint(cx, cy, 0)
            end_gmsh_tag = gmsh.model.occ.addPoint(ex, ey, 0)
        tag = gmsh.model.occ.addCircleArc(start_gmsh_tag, center_gmsh_tag, end_gmsh_tag)
        key = _get_entity_key(params)
        if key:
            self._line_map[key] = tag

    def _add_surface(self, params: dict, variables: dict[str, float]):
        edge_ids = params["edge_ids"]
        curve_tags = [self._line_map[eid] for eid in edge_ids]
        loop_tag = gmsh.model.occ.addCurveLoop(curve_tags)
        tag = gmsh.model.occ.addPlaneSurface([loop_tag])
        key = _get_entity_key(params)
        if key:
            self._surface_map[key] = tag
            self._surface_edge_names[key] = [f"{key}_e{i}" for i in range(len(edge_ids))]

    # ── Shape primitives ──────────────────────────────────────────

    def _add_rectangle(self, params: dict, variables: dict[str, float]):
        """Add a filled rectangle.

        Supports two formats:
        - Corner format (backend/tests): ``x, y`` is the bottom-left corner.
        - Center format (frontend canvas): ``center_x, center_y`` is the body center.
        Both require ``width`` and ``height``.
        """
        w = _eval_param(params["width"], variables)
        h = _eval_param(params["height"], variables)
        if "center_x" in params:
            cx = _eval_param(params["center_x"], variables)
            cy = _eval_param(params["center_y"], variables)
            x = cx - w / 2.0
            y = cy - h / 2.0
        else:
            x = _eval_param(params["x"], variables)
            y = _eval_param(params["y"], variables)
        tag = gmsh.model.occ.addRectangle(x, y, 0, w, h)
        key = _get_entity_key(params)
        if key:
            self._surface_map[key] = tag
            self._surface_edge_names[key] = [f"{key}_e{i}" for i in range(4)]

    def _add_circle(self, params: dict, variables: dict[str, float]):
        """Add a filled disk.

        Supports two formats:
        - Legacy: ``cx, cy, radius``.
        - Frontend: ``center_x, center_y, radius``.
        """
        if "center_x" in params:
            cx = _eval_param(params["center_x"], variables)
            cy = _eval_param(params["center_y"], variables)
        else:
            cx = _eval_param(params["cx"], variables)
            cy = _eval_param(params["cy"], variables)
        r = _eval_param(params["radius"], variables)
        tag = gmsh.model.occ.addDisk(cx, cy, 0, r, r)
        key = _get_entity_key(params)
        if key:
            self._surface_map[key] = tag
            self._surface_edge_names[key] = [f"{key}_e0"]

    def _add_ellipse(self, params: dict, variables: dict[str, float]):
        """Add a filled ellipse disk.

        Supports two formats:
        - Legacy: ``cx, cy, rx, ry``.
        - Frontend: ``center_x, center_y, semi_axis_a, semi_axis_b``.
        """
        if "center_x" in params:
            cx = _eval_param(params["center_x"], variables)
            cy = _eval_param(params["center_y"], variables)
            rx = _eval_param(params["semi_axis_a"], variables)
            ry = _eval_param(params["semi_axis_b"], variables)
        else:
            cx = _eval_param(params["cx"], variables)
            cy = _eval_param(params["cy"], variables)
            rx = _eval_param(params["rx"], variables)
            ry = _eval_param(params["ry"], variables)
        tag = gmsh.model.occ.addDisk(cx, cy, 0, rx, ry)
        key = _get_entity_key(params)
        if key:
            self._surface_map[key] = tag
            self._surface_edge_names[key] = [f"{key}_e0"]

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
            ln = gmsh.model.occ.addLine(point_tags[i], point_tags[(i + 1) % n])
            line_tags.append(ln)

        loop = gmsh.model.occ.addCurveLoop(line_tags)
        tag = gmsh.model.occ.addPlaneSurface([loop])
        key = _get_entity_key(params)
        if key:
            self._surface_map[key] = tag
            self._surface_edge_names[key] = [f"{key}_e{i}" for i in range(n)]

    # ── Boolean operations ────────────────────────────────────────

    @staticmethod
    def _bool_keys(params: dict) -> tuple[str, str]:
        """Return (object_key, tool_key) accepting both naming conventions.

        Frontend sends ``object_tag`` / ``tool_tag``; backend tests may use
        ``object`` / ``tool``.
        """
        obj = params.get("object") or params["object_tag"]
        tool = params.get("tool") or params["tool_tag"]
        return obj, tool

    def _boolean_union(self, params: dict, variables: dict[str, float]):
        obj_key, tool_key = self._bool_keys(params)
        obj_tag = self._surface_map[obj_key]
        tool_tag = self._surface_map[tool_key]
        obj_edge_names = self._surface_edge_names.pop(obj_key, [])
        tool_edge_names = self._surface_edge_names.pop(tool_key, [])
        out, _ = gmsh.model.occ.fuse([(2, obj_tag)], [(2, tool_tag)])
        # Update surface map: remove old, add result
        del self._surface_map[obj_key]
        self._surface_map.pop(tool_key, None)
        if out:
            result_key = _get_entity_key(params) or obj_key
            self._surface_map[result_key] = out[0][1]
            # Edge names may not match 1:1 after union; will be re-detected
            self._surface_edge_names[result_key] = obj_edge_names + tool_edge_names

    def _boolean_subtract(self, params: dict, variables: dict[str, float]):
        obj_key, tool_key = self._bool_keys(params)
        obj_tag = self._surface_map[obj_key]
        tool_tag = self._surface_map[tool_key]
        obj_edge_names = list(self._surface_edge_names.get(obj_key, []))
        tool_edge_names = list(self._surface_edge_names.get(tool_key, []))
        remove_tool = params.get("remove_tool", True)
        out, _ = gmsh.model.occ.cut(
            [(2, obj_tag)],
            [(2, tool_tag)],
            removeObject=True,
            removeTool=remove_tool,
        )
        self._surface_edge_names.pop(obj_key, None)
        del self._surface_map[obj_key]
        if remove_tool:
            self._surface_map.pop(tool_key, None)
            self._surface_edge_names.pop(tool_key, None)
        if out:
            result_key = _get_entity_key(params) or obj_key
            self._surface_map[result_key] = out[0][1]
            # Outer edges from object + inner edges (hole) from tool
            hole_edge_names = [f"{result_key}_hole_{n}" for n in tool_edge_names]
            self._surface_edge_names[result_key] = obj_edge_names + hole_edge_names

    def _boolean_intersect(self, params: dict, variables: dict[str, float]):
        obj_key, tool_key = self._bool_keys(params)
        obj_tag = self._surface_map[obj_key]
        tool_tag = self._surface_map[tool_key]
        tool_edge_names = list(self._surface_edge_names.get(tool_key, []))
        self._surface_edge_names.pop(obj_key, None)
        self._surface_edge_names.pop(tool_key, None)
        out, _ = gmsh.model.occ.intersect([(2, obj_tag)], [(2, tool_tag)])
        del self._surface_map[obj_key]
        self._surface_map.pop(tool_key, None)
        if out:
            result_key = _get_entity_key(params) or obj_key
            self._surface_map[result_key] = out[0][1]
            self._surface_edge_names[result_key] = tool_edge_names

    def _boolean_fragment(self, params: dict, variables: dict[str, float]):
        obj_key, tool_key = self._bool_keys(params)
        obj_tag = self._surface_map[obj_key]
        tool_tag = self._surface_map[tool_key]
        self._surface_edge_names.pop(obj_key, None)
        self._surface_edge_names.pop(tool_key, None)
        out, _ = gmsh.model.occ.fragment([(2, obj_tag)], [(2, tool_tag)])
        del self._surface_map[obj_key]
        self._surface_map.pop(tool_key, None)
        # Fragment produces multiple surfaces — store all with auto-generated IDs
        base_id = _get_entity_key(params) or obj_key
        for i, (_, surf_tag) in enumerate(out):
            key = f"{base_id}_{i}" if i > 0 else base_id
            self._surface_map[key] = surf_tag

    # ── Physical groups ───────────────────────────────────────────

    def _create_physical_groups(self) -> None:
        """Create physical groups for surfaces and their boundary curves.

        Each surface gets a 2D physical group named after its geometry ID.
        Each boundary curve gets a 1D physical group named with a sequential
        edge ID (e.g., ``rect1_e0``).  When the number of Gmsh boundary
        curves differs from the tracked edge names (common after boolean
        operations), sequential ``{surface_key}_e{i}`` names are used.
        """
        assigned_curves: set[int] = set()

        for surface_key, gmsh_tag in self._surface_map.items():
            # 2D physical group for the surface
            gmsh.model.addPhysicalGroup(2, [gmsh_tag], name=surface_key)

            # 1D physical groups for each boundary curve
            boundary = gmsh.model.getBoundary([(2, gmsh_tag)], combined=False, oriented=False)
            curve_tags = [abs(tag) for dim, tag in boundary if dim == 1]

            edge_names = self._surface_edge_names.get(surface_key, [])
            for i, curve_tag in enumerate(curve_tags):
                if curve_tag in assigned_curves:
                    continue
                if i < len(edge_names):
                    name = edge_names[i]
                else:
                    name = f"{surface_key}_e{i}"
                gmsh.model.addPhysicalGroup(1, [curve_tag], name=name)
                assigned_curves.add(curve_tag)
