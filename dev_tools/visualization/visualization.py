"""Visualization utilities for debugging antenna geometries."""

from typing import Optional

import numpy as np

from backend.common.models.geometry import AntennaElement, Mesh


def print_mesh_info(mesh: Mesh, element: Optional[AntennaElement] = None) -> None:
    """
    Print detailed mesh information to console.

    Args:
        mesh: Mesh object to visualize
        element: Optional antenna element for additional context
    """
    print("\n" + "=" * 60)
    print("MESH DEBUG INFORMATION")
    print("=" * 60)

    if element:
        print(f"\nElement: {element.name} (type: {element.type})")
        print(f"ID: {element.id}")
        if element.source:
            print(
                f"Source: {element.source.type} between nodes {element.source.node_start} and {element.source.node_end}"
            )

    print(f"\nNodes: {len(mesh.nodes)}")
    print(f"Edges: {len(mesh.edges)}")
    print(f"Total wire segments: {len(mesh.radii)}")

    # Print node coordinates (displaying 1-based indices for user reference)
    print("\n--- Node Coordinates ---")
    nodes_array = np.array(mesh.nodes)
    for i, node in enumerate(nodes_array):
        print(f"  Node {i+1:3d}: ({node[0]:8.4f}, {node[1]:8.4f}, {node[2]:8.4f})")

    # Print edge connectivity (displaying 1-based indices for user reference)
    print("\n--- Edge Connectivity ---")
    for i, edge in enumerate(mesh.edges):
        n1, n2 = edge
        p1 = nodes_array[n1]
        p2 = nodes_array[n2]
        length = np.linalg.norm(p2 - p1)
        print(
            f"  Edge {i:3d}: {n1+1:3d} -> {n2+1:3d}  (length: {length:.4f}m, radius: {mesh.radii[i]:.5f}m)"
        )

    # Print bounding box
    print("\n--- Bounding Box ---")
    mins = nodes_array.min(axis=0)
    maxs = nodes_array.max(axis=0)
    print(f"  X: [{mins[0]:8.4f}, {maxs[0]:8.4f}]  (span: {maxs[0]-mins[0]:.4f}m)")
    print(f"  Y: [{mins[1]:8.4f}, {maxs[1]:8.4f}]  (span: {maxs[1]-mins[1]:.4f}m)")
    print(f"  Z: [{mins[2]:8.4f}, {maxs[2]:8.4f}]  (span: {maxs[2]-mins[2]:.4f}m)")

    print("=" * 60 + "\n")


def plot_mesh_3d(
    mesh: Mesh,
    element: Optional[AntennaElement] = None,
    show: bool = True,
    save_path: Optional[str] = None,
) -> None:
    """
    Create a 3D plot of the mesh structure using matplotlib.

    Args:
        mesh: Mesh object to visualize
        element: Optional antenna element for title
        show: Whether to display the plot
        save_path: Optional path to save the figure
    """
    try:
        import matplotlib.pyplot as plt
        from mpl_toolkits.mplot3d import Axes3D
    except ImportError:
        print("Matplotlib not installed. Install with: pip install matplotlib")
        return

    fig = plt.figure(figsize=(10, 8))
    ax = fig.add_subplot(111, projection="3d")

    nodes_array = np.array(mesh.nodes)

    # Plot edges as lines
    for i, edge in enumerate(mesh.edges):
        n1, n2 = edge
        p1 = nodes_array[n1]
        p2 = nodes_array[n2]
        ax.plot([p1[0], p2[0]], [p1[1], p2[1]], [p1[2], p2[2]], "b-", linewidth=2, alpha=0.7)

    # Plot nodes as points
    ax.scatter(
        nodes_array[:, 0],
        nodes_array[:, 1],
        nodes_array[:, 2],
        c="red",
        s=30,
        alpha=0.8,
        label="Nodes",
    )

    # Highlight source location if present
    # Source uses 1-based node indices, convert to 0-based for array access
    if element and element.source:
        # Convert 1-based to 0-based indices for array access
        idx_start = element.source.node_start - 1 if element.source.node_start > 0 else 0
        idx_end = element.source.node_end - 1 if element.source.node_end > 0 else 0
        if 0 <= idx_start < len(nodes_array) and 0 <= idx_end < len(nodes_array):
            # Mark both nodes and draw a line between them
            node1_pos = nodes_array[idx_start]
            node2_pos = nodes_array[idx_end]

            # Draw line between source nodes
            ax.plot(
                [node1_pos[0], node2_pos[0]],
                [node1_pos[1], node2_pos[1]],
                [node1_pos[2], node2_pos[2]],
                "g-",
                linewidth=4,
                alpha=0.8,
                label=f"Source ({element.source.type})",
            )

            # Mark the midpoint
            mid_pos = (node1_pos + node2_pos) / 2
            ax.scatter([mid_pos[0]], [mid_pos[1]], [mid_pos[2]], c="green", s=200, marker="*")

    # Set labels and title
    ax.set_xlabel("X (m)")
    ax.set_ylabel("Y (m)")
    ax.set_zlabel("Z (m)")

    title = "Antenna Mesh Visualization"
    if element:
        title = f"{element.name} - {title}"
    ax.set_title(title)

    # Equal aspect ratio
    max_range = (
        np.array(
            [
                nodes_array[:, 0].max() - nodes_array[:, 0].min(),
                nodes_array[:, 1].max() - nodes_array[:, 1].min(),
                nodes_array[:, 2].max() - nodes_array[:, 2].min(),
            ]
        ).max()
        / 2.0
    )

    mid_x = (nodes_array[:, 0].max() + nodes_array[:, 0].min()) * 0.5
    mid_y = (nodes_array[:, 1].max() + nodes_array[:, 1].min()) * 0.5
    mid_z = (nodes_array[:, 2].max() + nodes_array[:, 2].min()) * 0.5

    ax.set_xlim(mid_x - max_range, mid_x + max_range)
    ax.set_ylim(mid_y - max_range, mid_y + max_range)
    ax.set_zlim(mid_z - max_range, mid_z + max_range)

    ax.legend()
    ax.grid(True, alpha=0.3)

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches="tight")
        print(f"Figure saved to: {save_path}")

    if show:
        plt.show()
    else:
        # Don't close if we're not showing - caller might want to save
        return fig

    plt.close()
    return fig


def visualize_mesh(
    mesh: Mesh,
    element: Optional[AntennaElement] = None,
    console: bool = True,
    plot: bool = False,
    save_path: Optional[str] = None,
) -> None:
    """
    Visualize mesh with multiple options.

    Args:
        mesh: Mesh object to visualize
        element: Optional antenna element for context
        console: Print console output
        plot: Show 3D plot
        save_path: Save plot to file
    """
    if console:
        print_mesh_info(mesh, element)

    if plot or save_path:
        plot_mesh_3d(mesh, element, show=plot, save_path=save_path)
