import React, { useMemo, useState } from "react";
import * as d3 from "d3";

interface BatchStatusPieChartProps {
  completed: number;
  generating: number;
  idle: number;
  failed: number;
}

interface StatusData {
  status: string;
  count: number;
  color: string;
}

export const BatchStatusPieChart: React.FC<BatchStatusPieChartProps> = ({
  completed,
  generating,
  idle,
  failed,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = completed + generating + idle + failed;

  const data = useMemo<StatusData[]>(() => {
    return [
      { status: "Completed", count: completed, color: "#10B981" }, // Emerald 500
      { status: "Generating", count: generating, color: "#4ADE80" }, // Bright green
      { status: "Idle", count: idle, color: "#4b5563" }, // Slate 600
      { status: "Failed", count: failed, color: "#EF4444" }, // Red 500
    ];
  }, [completed, generating, idle, failed]);

  // Dimensions
  const width = 110;
  const height = 110;
  const radius = Math.min(width, height) / 2;
  const innerRadius = radius - 12; // Donut style
  const outerRadius = radius - 2;

  // D3 Pie layout
  const pieArcs = useMemo(() => {
    if (total === 0) return [];
    
    const pieGenerator = d3.pie<StatusData>()
      .value(d => d.count)
      .sort(null); // Preserve order
      
    return pieGenerator(data);
  }, [data, total]);

  // Arc generator
  const arcGenerator = useMemo(() => {
    return d3.arc<d3.PieArcDatum<StatusData>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(2)
      .padAngle(total > 1 ? 0.05 : 0); // Spacing between segments
  }, [innerRadius, outerRadius, total]);

  // Hover arc generator (slightly popped out)
  const hoverArcGenerator = useMemo(() => {
    return d3.arc<d3.PieArcDatum<StatusData>>()
      .innerRadius(innerRadius - 1)
      .outerRadius(outerRadius + 2)
      .cornerRadius(2)
      .padAngle(total > 1 ? 0.05 : 0);
  }, [innerRadius, outerRadius, total]);

  // Center display values
  const centerDisplay = useMemo(() => {
    if (total === 0) {
      return { value: "0", label: "Items" };
    }
    if (hoveredIndex !== null) {
      const item = data[hoveredIndex];
      const pct = Math.round((item.count / total) * 100);
      return {
        value: `${item.count}`,
        label: `${item.status} (${pct}%)`,
        color: item.color,
      };
    }
    return { value: `${total}`, label: "Total Items" };
  }, [data, hoveredIndex, total]);

  return (
    <div className="flex items-center gap-4 select-none">
      {/* SVG Donut Container */}
      <div className="relative" style={{ width, height }}>
        <svg width={width} height={height} className="overflow-visible">
          <g transform={`translate(${width / 2}, ${height / 2})`}>
            {total === 0 ? (
              // Grey empty state circle
              <path
                d={d3.arc()({
                  innerRadius,
                  outerRadius,
                  startAngle: 0,
                  endAngle: 2 * Math.PI,
                }) || undefined}
                fill="#2D3036"
                className="opacity-40"
              />
            ) : (
              // Interactive Pie slices
              pieArcs.map((arc, index) => {
                const isHovered = hoveredIndex === index;
                const pathD = isHovered ? hoverArcGenerator(arc) : arcGenerator(arc);
                return (
                  <path
                    key={index}
                    d={pathD || undefined}
                    fill={arc.data.color}
                    className="transition-all duration-200 cursor-pointer hover:brightness-110"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    style={{
                      filter: isHovered ? "drop-shadow(0 0 4px rgba(74, 222, 128, 0.2))" : "none",
                    }}
                  />
                );
              })
            )}
          </g>
        </svg>

        {/* Text centered inside the donut hole */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span 
            className="text-sm font-black font-mono leading-none transition-colors duration-150"
            style={{ color: centerDisplay.color || "#ffffff" }}
          >
            {centerDisplay.value}
          </span>
          <span className="text-[7.5px] text-[#8E9299] uppercase tracking-wider font-bold block mt-0.5 max-w-[76px] truncate">
            {centerDisplay.label}
          </span>
        </div>
      </div>

      {/* Visual Legend */}
      <div className="flex-1 space-y-1.5 font-mono text-[9px]">
        {data.map((item, index) => {
          const isHovered = hoveredIndex === index;
          return (
            <div
              key={item.status}
              className={`flex items-center justify-between p-1 rounded transition-colors duration-150 ${
                isHovered ? "bg-[#15171C]" : ""
              }`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="flex items-center gap-1.5">
                <span 
                  className="w-1.5 h-1.5 rounded-full block" 
                  style={{ backgroundColor: item.color }}
                />
                <span className={`${isHovered ? "text-white font-bold" : "text-[#8E9299]"}`}>
                  {item.status}
                </span>
              </div>
              <span className="font-bold text-white pl-2">
                {item.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
