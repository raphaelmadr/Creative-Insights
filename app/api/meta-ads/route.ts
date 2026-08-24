import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  let metaAccountId = settings?.metaAdAccountId;
  const metaToken = settings?.metaAccessToken;

  if (metaAccountId && !metaAccountId.startsWith('act_')) {
    metaAccountId = `act_${metaAccountId}`;
  }

  if (!metaAccountId || !metaToken) {
    return NextResponse.json({ error: "Missing API keys" }, { status: 500 });
  }

  try {
    // We must query the /ads endpoint, not /insights, because adcreatives can only be queried from the ad node itself.
    // Adicionado asset_feed_spec para pegar os hashes de imagens dinâmicas e image_hash
    const metaUrl = `https://graph.facebook.com/v19.0/${metaAccountId}/ads?fields=name,campaign{name},adset{name},adcreatives{image_url,thumbnail_url,image_hash,object_story_spec{video_data{image_url}},asset_feed_spec{images{hash}}},insights.date_preset(last_7d){spend,purchase_roas,actions,action_values,cpm,ctr,cpc}&access_token=${metaToken}&limit=100`;
    
    const metaResponse = await fetch(metaUrl);
    const metaData = await metaResponse.json();

    if (metaData.error) {
      throw new Error(metaData.error.message);
    }

    const ads = metaData.data || [];
    const rawData = metaData.data || [];
    
    // --- Passo 1: Coletar hashes de imagens estáticas que não possuem URL direta ---
    const imageHashes = new Set<string>();
    rawData.forEach((adNode: any) => {
      if (adNode.adcreatives && adNode.adcreatives.data && adNode.adcreatives.data.length > 0) {
        const creative = adNode.adcreatives.data[0];
        if (!creative.object_story_spec?.video_data?.image_url && !creative.image_url) {
          if (creative.image_hash) {
            imageHashes.add(creative.image_hash);
          } else if (creative.asset_feed_spec?.images && creative.asset_feed_spec.images.length > 0) {
            imageHashes.add(creative.asset_feed_spec.images[0].hash);
          }
        }
      }
    });

    // --- Passo 2: Buscar as URLs de alta resolução para esses hashes ---
    const hashToUrlMap: Record<string, string> = {};
    if (imageHashes.size > 0) {
      const hashesArray = Array.from(imageHashes);
      const hashesParam = encodeURIComponent(JSON.stringify(hashesArray));
      const imagesUrl = `https://graph.facebook.com/v19.0/${metaAccountId}/adimages?hashes=${hashesParam}&fields=url&access_token=${metaToken}`;
      try {
        const imagesRes = await fetch(imagesUrl);
        const imagesData = await imagesRes.json();
        if (imagesData && imagesData.data) {
          imagesData.data.forEach((img: any) => {
            const hashParts = img.id.split(":");
            const hash = hashParts.length > 1 ? hashParts[1] : img.id;
            hashToUrlMap[hash] = img.url;
          });
        }
      } catch (err) {
        console.error("Erro ao buscar adimages:", err);
      }
    }

    // --- Passo 3: Montar os dados finais ---
    const topPerformance: any[] = [];
    const testes: Record<string, any[]> = {};
    let totalSpend = 0;
    let totalPurchases = 0;
    let totalMessages = 0;

    rawData.forEach((adNode: any) => {
      // If there are no insights for the last 7 days, skip
      if (!adNode.insights || !adNode.insights.data || adNode.insights.data.length === 0) return;
      
      const ad = adNode.insights.data[0];

      const spend = parseFloat(ad.spend || 0);
      if (spend <= 0) return; // Ignore ads without spend in the last 7 days

      totalSpend += spend;

      const campaignNameStr = (adNode.campaign?.name || "").toLowerCase();
      const adsetNameStr = (adNode.adset?.name || "").toLowerCase();
      
      const roasObj = ad.purchase_roas?.find((a: any) => a.action_type === 'omni_purchase');
      const roas = roasObj ? parseFloat(roasObj.value).toFixed(2) : "0.00";
      
      const purchasesObj = ad.actions?.find((a: any) => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
      const purchases = purchasesObj ? parseInt(purchasesObj.value) : 0;
      totalPurchases += purchases;

      const msgObj = ad.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d');
      const messages = msgObj ? parseInt(msgObj.value) : 0;
      totalMessages += messages;

      const clicks = ad.clicks || 0;
      const cpm = parseFloat(ad.cpm || 0).toFixed(2);
      const ctr = parseFloat(ad.ctr || 0).toFixed(2);
      const cpc = parseFloat(ad.cpc || 0).toFixed(2);

      // Extrair Imagem do nó pai (adNode)
      let imageUrl = null;
      if (adNode.adcreatives && adNode.adcreatives.data && adNode.adcreatives.data.length > 0) {
        const creative = adNode.adcreatives.data[0];
        
        const videoHiRes = creative.object_story_spec?.video_data?.image_url;
        let staticHiRes = creative.image_url;
        
        // Se não tiver imagem direta, tentar puxar do mapa de hashes
        if (!videoHiRes && !staticHiRes) {
          const hash = creative.image_hash || creative.asset_feed_spec?.images?.[0]?.hash;
          if (hash && hashToUrlMap[hash]) {
            staticHiRes = hashToUrlMap[hash];
          }
        }
        
        imageUrl = videoHiRes || staticHiRes || creative.thumbnail_url || null;
      }

      // Extrair o responsável pelo criativo (ex: _RM.png, _PP.mov)
      // A regex procura um underline seguido de 2 a 3 letras pouco antes da extensão do arquivo ou " — Cópia"
      let designer = null;
      if (adNode.name) {
        const adNameLower = adNode.name.toLowerCase();
        // Fallback: match like meta-sync logic if possible, or just a simple regex 
        const match = adNameLower.match(/([_\- ][a-z]{2,3}(?:[\._ \-]|\b|$)|[a-z]{2,3}(?:\.[a-z0-9]{3,4})?$)/);
        if (match && match[1]) {
          // extract just the acronym part
          const acMatch = match[1].match(/[a-z]{2,3}/);
          if (acMatch) designer = acMatch[0].toUpperCase();
        }
      }

      const creativeData = {
        id: adNode.id,
        ad_name: adNode.name,
        campaign_name: adNode.campaign?.name || "Desconhecida",
        adset_name: adNode.adset?.name || "Desconhecido",
        spend: spend.toFixed(2),
        roas,
        purchases,
        messages,
        clicks,
        cpm,
        ctr,
        cpc,
        image_url: imageUrl,
        designer: designer
      };

      // Categorize
      const isTest = campaignNameStr.includes("teste") || adsetNameStr.includes("teste");
      
      if (isTest) {
        const groupName = creativeData.adset_name;
        if (!testes[groupName]) testes[groupName] = [];
        testes[groupName].push(creativeData);
      } else {
        topPerformance.push(creativeData);
      }
    });

    // Sort Top Performance by spend descending
    topPerformance.sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend));

    // Sort Test groups internally by spend descending
    Object.keys(testes).forEach(key => {
      testes[key].sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend));
    });

    return NextResponse.json({
      success: true,
      data: {
        topPerformance,
        testes,
        metrics: {
          totalSpend: totalSpend.toFixed(2),
          totalPurchases,
          totalMessages
        }
      }
    });

  } catch (err: any) {
    console.error("Meta API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
