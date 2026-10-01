import { expect, it } from 'vitest';
import { analyzeMesh } from '../src/mesh/analyzeMesh';
import { createDemo } from '../src/mesh/demo';

it('synthetic 10k / 100k mesh smoke and timing sample', () => {
  for (const size of [71,224]) {
    const source = createDemo(size), samples: number[] = [];
    for (let run=0;run<3;run++) {
      const data = analyzeMesh(source);
      expect(data.graph.faceCount).toBe(2*size*size);
      expect(data.components).toEqual([{id:0,faceCount:2*size*size}]);
      expect(data.diagnostics.unmatchedHalfEdgeCount).toBe(4*size);
      expect(data.graph.offsets[data.graph.faceCount]).toBe(data.graph.neighbors.length);
      expect(data.diagnostics.warnings).toHaveLength(0);
      samples.push(data.timings['Compute total']); data.geometry.dispose();
    }
    console.log(JSON.stringify({faces:2*size*size,medianMs:samples.sort((a,b)=>a-b)[1],samplesMs:samples})); source.dispose();
  }
}, 30_000);
