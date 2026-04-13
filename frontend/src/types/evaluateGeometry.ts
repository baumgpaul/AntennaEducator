/**
 * evaluateGeometry — derive EvaluatedGeometry from GeoOperation[].
 *
 * Runs purely on the frontend (no backend call needed). Converts
 * each primitive operation into a Surface + child Edges with
 * auto-descriptive names based on naming counters.
 *
 * This is a simplified client-side evaluation:
 *  - Primitives (rectangle, circle, ellipse, polygon) create surfaces with child edges.
 *  - Standalone elements (point, line, arc) create points/edges without parents.
 *  - Boolean operations are recorded but full topological evaluation
 *    happens on the backend via Gmsh.
 */

import type {
  GeoOperation,
  GeoPointDef,
  GeoEdgeDef,
  GeoSurfaceDef,
  EvaluatedGeometry,
  NamingCounters,
} from './femGeometry'
import {
  rectangleEdgeNames,
  circleEdgeName,
  ellipseEdgeName,
  polygonEdgeNames,
} from './femGeometry'

/**
 * Build EvaluatedGeometry from operations + current naming state.
 *
 * Each primitive op with a `tag` param becomes a surface; its boundary
 * edges are generated automatically. Standalone lines/arcs become edges
 * without a parent surface.
 */
export function evaluateGeometry(
  operations: GeoOperation[],
  _namingCounters: NamingCounters,
): EvaluatedGeometry {
  const points: GeoPointDef[] = []
  const edges: GeoEdgeDef[] = []
  const surfaces: GeoSurfaceDef[] = []

  for (const op of operations) {
    const p = op.params as Record<string, unknown>
    const tag = String(p.tag ?? '')

    switch (op.type) {
      case 'add_point': {
        points.push({
          id: tag || `pt_${points.length}`,
          x: p.x as number | string,
          y: p.y as number | string,
        })
        break
      }
      case 'add_line': {
        edges.push({
          id: tag || `line_${edges.length}`,
          name: tag || `line_${edges.length}`,
          edgeType: 'line',
          pointIds: [],
          parentSurfaceId: null,
        })
        break
      }
      case 'add_arc': {
        edges.push({
          id: tag || `arc_${edges.length}`,
          name: tag || `arc_${edges.length}`,
          edgeType: 'arc',
          pointIds: [],
          parentSurfaceId: null,
        })
        break
      }
      case 'add_rectangle': {
        const surfId = tag || `rect_${surfaces.length}`
        const surfName = surfId
        const edgeNames = rectangleEdgeNames(surfName)
        const edgeIds = edgeNames.map((_, i) => `${surfId}_e${i}`)

        for (let i = 0; i < 4; i++) {
          edges.push({
            id: edgeIds[i],
            name: edgeNames[i],
            edgeType: 'line',
            pointIds: [],
            parentSurfaceId: surfId,
          })
        }

        surfaces.push({
          id: surfId,
          name: surfName,
          edgeIds,
          innerLoops: [],
          primitiveType: 'rectangle',
        })
        break
      }
      case 'add_circle': {
        const surfId = tag || `circle_${surfaces.length}`
        const surfName = surfId
        const eName = circleEdgeName(surfName)
        const eId = `${surfId}_e0`

        edges.push({
          id: eId,
          name: eName,
          edgeType: 'arc',
          pointIds: [],
          parentSurfaceId: surfId,
        })

        surfaces.push({
          id: surfId,
          name: surfName,
          edgeIds: [eId],
          innerLoops: [],
          primitiveType: 'circle',
        })
        break
      }
      case 'add_ellipse': {
        const surfId = tag || `ellipse_${surfaces.length}`
        const surfName = surfId
        const eName = ellipseEdgeName(surfName)
        const eId = `${surfId}_e0`

        edges.push({
          id: eId,
          name: eName,
          edgeType: 'arc',
          pointIds: [],
          parentSurfaceId: surfId,
        })

        surfaces.push({
          id: surfId,
          name: surfName,
          edgeIds: [eId],
          innerLoops: [],
          primitiveType: 'ellipse',
        })
        break
      }
      case 'add_polygon': {
        const surfId = tag || `polygon_${surfaces.length}`
        const surfName = surfId
        const verts = (p.vertices as [number, number][]) ?? []
        const nEdges = verts.length
        const edgeNamesList = polygonEdgeNames(surfName, nEdges)
        const edgeIds = edgeNamesList.map((_, i) => `${surfId}_e${i}`)

        for (let i = 0; i < nEdges; i++) {
          edges.push({
            id: edgeIds[i],
            name: edgeNamesList[i],
            edgeType: 'line',
            pointIds: [],
            parentSurfaceId: surfId,
          })
        }

        surfaces.push({
          id: surfId,
          name: surfName,
          edgeIds,
          innerLoops: [],
          primitiveType: 'polygon',
        })
        break
      }
      case 'boolean_union':
      case 'boolean_subtract':
      case 'boolean_intersect':
      case 'boolean_fragment': {
        // Boolean results need backend evaluation for full topology.
        // Client-side approximation: transfer edges from operands to result.
        const objTag = String(p.object_tag ?? p.object ?? '')
        const toolTag = String(p.tool_tag ?? p.tool ?? '')

        // Collect operand info before modifying
        const objSurf = surfaces.find((s) => s.id === objTag)
        const toolSurf = surfaces.find((s) => s.id === toolTag)
        const objEdgeIds = objSurf ? [...objSurf.edgeIds] : []
        const toolEdgeIds = toolSurf ? [...toolSurf.edgeIds] : []

        const resultTag = tag || objTag || `bool_${surfaces.length}`

        if (op.type === 'boolean_subtract') {
          // Subtract: result surface = object - tool.
          // Inner loop edges are always independent copies (owned by result),
          // so that deleting the tool surface later keeps the hole boundary.
          //
          // If remove_tool is true (default): tool surface + its edges are removed.
          // If remove_tool is false (keep tool): tool surface stays with its edges.
          const removeTool = p.remove_tool !== false

          // Remove the object surface (replaced by result)
          const objIdx = surfaces.findIndex((s) => s.id === objTag)
          if (objIdx >= 0) {
            surfaces.splice(objIdx, 1)
            // Re-parent object edges to result
            for (const eid of objEdgeIds) {
              const edge = edges.find((e) => e.id === eid)
              if (edge) edge.parentSurfaceId = resultTag
            }
          }

          // Create independent copies of tool edges as children of the result surface
          const innerEdgeIds: string[] = []
          for (const toolEid of toolEdgeIds) {
            const srcEdge = edges.find((e) => e.id === toolEid)
            if (srcEdge) {
              const innerEid = `${resultTag}_hole_${toolEid}`
              edges.push({
                id: innerEid,
                name: `${resultTag}_hole`,
                edgeType: srcEdge.edgeType,
                pointIds: [...srcEdge.pointIds],
                parentSurfaceId: resultTag,
              })
              innerEdgeIds.push(innerEid)
            }
          }

          // Remove tool surface + its edges if requested
          if (removeTool) {
            const toolIdx = surfaces.findIndex((s) => s.id === toolTag)
            if (toolIdx >= 0) surfaces.splice(toolIdx, 1)
            for (const eid of toolEdgeIds) {
              const ei = edges.findIndex((e) => e.id === eid)
              if (ei >= 0) edges.splice(ei, 1)
            }
          }

          surfaces.push({
            id: resultTag,
            name: `Subtract(${objTag}, ${toolTag})`,
            edgeIds: [...objEdgeIds, ...innerEdgeIds],
            innerLoops: [],
            primitiveType: 'boolean_result',
          })
        } else {
          // Union / Intersect / Fragment: merge surfaces, no tool kept
          const removeTool = p.remove_tool !== false

          // Remove the object surface
          const objIdx = surfaces.findIndex((s) => s.id === objTag)
          if (objIdx >= 0) {
            surfaces.splice(objIdx, 1)
            for (const eid of objEdgeIds) {
              const edge = edges.find((e) => e.id === eid)
              if (edge) edge.parentSurfaceId = null
            }
          }

          // Handle tool surface
          if (removeTool) {
            const toolIdx = surfaces.findIndex((s) => s.id === toolTag)
            if (toolIdx >= 0) {
              surfaces.splice(toolIdx, 1)
              for (const eid of toolEdgeIds) {
                const edge = edges.find((e) => e.id === eid)
                if (edge) edge.parentSurfaceId = null
              }
            }
          }

          const opLabel =
            op.type === 'boolean_union' ? 'Union'
            : op.type === 'boolean_intersect' ? 'Intersect'
            : 'Fragment'

          let resultEdgeIds: string[]
          if (op.type === 'boolean_union') {
            resultEdgeIds = [...objEdgeIds, ...toolEdgeIds]
          } else {
            resultEdgeIds = toolEdgeIds.length > 0 ? toolEdgeIds : objEdgeIds
          }

          // Re-parent edges to result
          for (const eid of resultEdgeIds) {
            const edge = edges.find((e) => e.id === eid)
            if (edge) edge.parentSurfaceId = resultTag
          }

          // Remove unreferenced tool edges for union
          if (removeTool && op.type !== 'boolean_union') {
            const resultSet = new Set(resultEdgeIds)
            for (const eid of toolEdgeIds) {
              if (!resultSet.has(eid)) {
                const ei = edges.findIndex((e) => e.id === eid)
                if (ei >= 0) edges.splice(ei, 1)
              }
            }
          }

          surfaces.push({
            id: resultTag,
            name: `${opLabel}(${objTag}, ${toolTag})`,
            edgeIds: resultEdgeIds,
            innerLoops: [],
            primitiveType: 'boolean_result',
          })
        }
        break
      }
      default:
        break
    }
  }

  return {
    points,
    edges,
    surfaces,
    bodies: surfaces, // legacy alias
  }
}
