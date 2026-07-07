import React, { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

interface PlotlyChartProps {
  subplotId: string;
  traces: string[];
  getTraceData: (traceName: string) => number[];
  getTraceColor: (traceName: string) => string;
  tData: number[];
  displayXMin: number;
  displayXMax: number;
  height: number;
  theme: string;
  simResults: any;
}

const PlotlyChart: React.FC<PlotlyChartProps> = ({
  subplotId,
  traces,
  getTraceData,
  getTraceColor,
  tData,
  displayXMin,
  displayXMax,
  height,
  theme,
  simResults
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isLight = theme === 'light';

  useEffect(() => {
    if (!containerRef.current) return;

    // Filter time range (zoom viewport)
    const xData: number[] = [];
    const traceValues: Record<string, number[]> = {};
    traces.forEach(t => { traceValues[t] = []; });

    for (let i = 0; i < tData.length; i++) {
      const t = tData[i];
      if (t >= displayXMin && t <= displayXMax) {
        xData.push(t);
        traces.forEach(traceName => {
          const arr = getTraceData(traceName);
          traceValues[traceName].push(arr[i] ?? 0.0);
        });
      }
    }

    const data = traces.map(traceName => ({
      x: xData,
      y: traceValues[traceName],
      name: traceName,
      type: 'scatter',
      mode: 'lines',
      line: {
        color: getTraceColor(traceName),
        width: 1.8
      },
      hoverinfo: 'x+y+name'
    }));

    // Theme coloring
    const gridColor = isLight ? '#e2e8f0' : '#1e293b';
    const textColor = isLight ? '#475569' : '#94a3b8';

    const layout = {
      margin: { t: 5, r: 15, b: 20, l: 45 },
      height: height,
      autosize: true,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      xaxis: {
        range: [displayXMin, displayXMax],
        gridcolor: gridColor,
        zeroline: false,
        tickfont: { size: 8, color: textColor },
        showline: true,
        linecolor: gridColor
      },
      yaxis: {
        gridcolor: gridColor,
        zeroline: false,
        tickfont: { size: 8, color: textColor },
        showline: true,
        linecolor: gridColor
      }
    };

    const config = {
      displayModeBar: true,
      responsive: true
    };

    Plotly.react(containerRef.current, data, layout as any, config);
  }, [traces, tData, displayXMin, displayXMax, height, theme, simResults]);

  return <div ref={containerRef} style={{ width: '100%', height: height }} />;
};

export default PlotlyChart;
