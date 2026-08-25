const month = 8;
const year = 2026;

async function run() {
  const resReports = await fetch(`http://localhost:3000/api/reports/creators?month=${month}&year=${year}`);
  const jsonReports = await resReports.json();
  
  const resDeliveries = await fetch(`http://localhost:3000/api/deliveries?month=${month}&year=${year}`);
  const jsonDeliveries = await resDeliveries.json();
  
  let deliveriesRanking = [];
  if (jsonDeliveries.success) {
     deliveriesRanking = jsonDeliveries.ranking || [];
  }
  
  let unifiedStats = [];
  if (jsonReports.data) {
    unifiedStats = jsonReports.data.map((stat) => {
      const deliveryData = deliveriesRanking.find((d) => d.creatorId === stat.creatorId);
      return {
         ...stat,
         totalPieces: deliveryData ? deliveryData.totalPieces : 0
      };
    });
  }

  const totalPiecesUnified = unifiedStats.reduce((acc, curr) => acc + (curr.totalPieces || 0), 0);
  const totalPiecesRanking = deliveriesRanking.reduce((acc, curr) => acc + (curr.totalPieces || 0), 0);

  console.log(`UnifiedStats sum: ${totalPiecesUnified}`);
  console.log(`DeliveriesRanking sum: ${totalPiecesRanking}`);
  console.log(`jsonReports.data length: ${jsonReports.data?.length}`);
  console.log(`deliveriesRanking length: ${deliveriesRanking.length}`);

  for (const d of deliveriesRanking) {
    const foundInReports = jsonReports.data?.find(r => r.creatorId === d.creatorId);
    if (!foundInReports && d.totalPieces > 0) {
      console.log(`Creator with pieces missing in reports: ${d.name} (${d.totalPieces} pieces)`);
    }
  }
}

run().catch(console.error);
