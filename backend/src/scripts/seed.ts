import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/core-flows";
import {
  ExecArgs,
} from "@medusajs/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus
} from "@medusajs/utils";

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const remoteLink = container.resolve(
    ContainerRegistrationKeys.REMOTE_LINK
  );
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);

  const countries = ["in"];

  logger.info("Seeding store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    // create the default sales channel
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [
          {
            currency_code: "inr",
            is_default: true,
          },
        ],
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });
  logger.info("Seeding region data...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "India",
          currency_code: "inr",
          countries,
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const region = regionResult[0];
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
    })),
  });
  logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Rithushree Warehouse",
          address: {
            city: "Bangalore",
            country_code: "IN",
            address_1: "35, Dynamite Rd, Dasarahalli",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  await remoteLink.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  });

  logger.info("Seeding fulfillment data...");
  const { result: shippingProfileResult } =
    await createShippingProfilesWorkflow(container).run({
      input: {
        data: [
          {
            name: "Default",
            type: "default",
          },
        ],
      },
    });
  const shippingProfile = shippingProfileResult[0];

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Bangalore Warehouse delivery",
    type: "shipping",
    service_zones: [
      {
        name: "India",
        geo_zones: [
          {
            country_code: "in",
            type: "country",
          },
        ],
      },
    ],
  });

  await remoteLink.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Ship in 2-3 days.",
          code: "standard",
        },
        prices: [
          {
            currency_code: "inr",
            amount: 10,
          },
          {
            region_id: region.id,
            amount: 10,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: '"true"',
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
      {
        name: "Express Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Ship in 24 hours.",
          code: "express",
        },
        prices: [
          {
            currency_code: "inr",
            amount: 10,
          },
          {
            region_id: region.id,
            amount: 10,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: '"true"',
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  });
  logger.info("Finished seeding fulfillment data.");

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding publishable API key data...");
  const { result: publishableApiKeyResult } = await createApiKeysWorkflow(
    container
  ).run({
    input: {
      api_keys: [
        {
          title: "Webshop",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });
  const publishableApiKey = publishableApiKeyResult[0];

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding product data...");

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        {
          name: "Plain Shirts",
          is_active: true
        },
        {
          name: "Patterned Shirts",
          is_active: true
        },
        {
          name: "Check Shirts",
          is_active: true
        },
        {
          name: "Flannel Shirts",
          is_active: true
        },
        {
          name: "Formal Shirts",
          is_active: true
        },
        {
          name: "Striped Shirts",
          is_active: true
        },
        {
          name: "Floral Shirts",
          is_active: true
        },
        {
          name: "Denim Shirts",
          is_active: true
        },
        {
          name: "Linen Shirts",
          is_active: true
        },
        {
          name: "Casual Shirts",
          is_active: true
        },
        {
          name: "Short Sleeve Shirts",
          is_active: true
        },
        {
          name: "Long Sleeve Shirts",
          is_active: true
        },
        {
          name: "Printed Shirts",
          is_active: true
        },
      ],
    },
  });

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Classic Plain White Tee",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Plain Shirts").id,
          ],
          description:
            "The essential white t-shirt. Our Classic Plain White Tee is made from 100% premium cotton for superior comfort and durability. A versatile piece for any wardrobe.",
          handle: "plain-white-tee",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "https://via.placeholder.com/600x800?text=Plain+White+Front", // Placeholder image
            },
            {
              url: "https://via.placeholder.com/600x800?text=Plain+White+Back", // Placeholder image
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
            {
              title: "Color",
              values: ["White"], // Only White for this variant
            }
          ],
          variants: [
            {
              title: "S / White",
              sku: "PLAIN-S-WHITE",
              options: {
                Size: "S",
                Color: "White",
              },
              prices: [
                {
                  amount: 500,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "M / White",
              sku: "PLAIN-M-WHITE",
              options: {
                Size: "M",
                Color: "White",
              },
              prices: [
                {
                  amount: 500,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "L / White",
              sku: "PLAIN-L-WHITE",
              options: {
                Size: "L",
                Color: "White",
              },
              prices: [
                {
                  amount: 500,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "XL / White",
              sku: "PLAIN-XL-WHITE",
              options: {
                Size: "XL",
                Color: "White",
              },
              prices: [
                {
                  amount: 500,
                  currency_code: "inr",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Classic Plain Black Tee",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Plain Shirts").id,
          ],
          description:
            "The essential black t-shirt. Our Classic Plain Black Tee is made from 100% premium cotton for superior comfort and durability. A versatile piece for any wardrobe.",
          handle: "plain-black-tee",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "https://via.placeholder.com/600x800?text=Plain+Black+Front", // Placeholder image
            },
            {
              url: "https://via.placeholder.com/600x800?text=Plain+Black+Back", // Placeholder image
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
            {
              title: "Color",
              values: ["Black"], // Only Black for this variant
            }
          ],
          variants: [
            {
              title: "S / Black",
              sku: "PLAIN-S-BLACK",
              options: {
                Size: "S",
                Color: "Black",
              },
              prices: [
                {
                  amount: 500,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "M / Black",
              sku: "PLAIN-M-BLACK",
              options: {
                Size: "M",
                Color: "Black",
              },
              prices: [
                {
                  amount: 500,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "L / Black",
              sku: "PLAIN-L-BLACK",
              options: {
                Size: "L",
                Color: "Black",
              },
              prices: [
                {
                  amount: 500,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "XL / Black",
              sku: "PLAIN-XL-BLACK",
              options: {
                Size: "XL",
                Color: "Black",
              },
              prices: [
                {
                  amount: 500,
                  currency_code: "inr",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },

        // --- PATTERNED SHIRT ---
        {
          title: "Geometric Pattern Shirt",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Patterned Shirts").id,
          ],
          description:
            "Make a statement with our Geometric Pattern Shirt. This shirt features a modern, eye-catching geometric design printed on soft, breathable cotton.",
          handle: "geometric-pattern-shirt",
          weight: 250,
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "https://via.placeholder.com/600x800?text=Pattern+Front", // Placeholder image
            },
            {
              url: "https://via.placeholder.com/600x800?text=Pattern+Back", // Placeholder image
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
            {
              title: "Color",
              values: ["Default"], // Single color variant
            }
          ],
          variants: [
            {
              title: "S / Default",
              sku: "PATTERN-S-DEFAULT",
              options: {
                Size: "S",
                Color: "Default",
              },
              prices: [
                {
                  amount: 800,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "M / Default",
              sku: "PATTERN-M-DEFAULT",
              options: {
                Size: "M",
                Color: "Default",
              },
              prices: [
                {
                  amount: 800,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "L / Default",
              sku: "PATTERN-L-DEFAULT",
              options: {
                Size: "L",
                Color: "Default",
              },
              prices: [
                {
                  amount: 800,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "XL / Default",
              sku: "PATTERN-XL-DEFAULT",
              options: {
                Size: "XL",
                Color: "Default",
              },
              prices: [
                {
                  amount: 800,
                  currency_code: "inr",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },

        // --- FLANNEL SHIRTS ---
        {
          title: "Cozy Red Flannel Shirt",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Flannel Shirts").id,
          ],
          description:
            "Embrace comfort and warmth with our Cozy Red Flannel Shirt. This classic red flannel is made from ultra-soft, brushed cotton for a cozy feel.",
          handle: "red-flannel-shirt",
          weight: 350,
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "https://via.placeholder.com/600x800?text=Flannel+Red+Front", // Placeholder image
            },
            {
              url: "https://via.placeholder.com/600x800?text=Flannel+Red+Back", // Placeholder image
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
            {
              title: "Color",
              values: ["Default"], // Single color variant
            }
          ],
          variants: [
            {
              title: "S / Default",
              sku: "FLANNEL-RED-S-DEFAULT",
              options: {
                Size: "S",
                Color: "Default",
              },
              prices: [
                {
                  amount: 950,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "M / Default",
              sku: "FLANNEL-RED-M-DEFAULT",
              options: {
                Size: "M",
                Color: "Default",
              },
              prices: [
                {
                  amount: 950,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "L / Default",
              sku: "FLANNEL-RED-L-DEFAULT",
              options: {
                Size: "L",
                Color: "Default",
              },
              prices: [
                {
                  amount: 950,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "XL / Default",
              sku: "FLANNEL-RED-XL-DEFAULT",
              options: {
                Size: "XL",
                Color: "Default",
              },
              prices: [
                {
                  amount: 950,
                  currency_code: "inr",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Classic Blue Flannel Shirt",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Flannel Shirts").id,
          ],
          description:
            "Stay comfortable and stylish in our Classic Blue Flannel Shirt. Crafted from premium, soft-brushed cotton, this shirt provides warmth and a timeless look.",
          handle: "blue-flannel-shirt",
          weight: 350,
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "https://via.placeholder.com/600x800?text=Flannel+Blue+Front", // Placeholder image
            },
            {
              url: "https://via.placeholder.com/600x800?text=Flannel+Blue+Back", // Placeholder image
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
            {
              title: "Color",
              values: ["Default"], // Single color variant
            }
          ],
          variants: [
            {
              title: "S / Default",
              sku: "FLANNEL-BLUE-S-DEFAULT",
              options: {
                Size: "S",
                Color: "Default",
              },
              prices: [
                {
                  amount: 950,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "M / Default",
              sku: "FLANNEL-BLUE-M-DEFAULT",
              options: {
                Size: "M",
                Color: "Default",
              },
              prices: [
                {
                  amount: 950,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "L / Default",
              sku: "FLANNEL-BLUE-L-DEFAULT",
              options: {
                Size: "L",
                Color: "Default",
              },
              prices: [
                {
                  amount: 950,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "XL / Default",
              sku: "FLANNEL-BLUE-XL-DEFAULT",
              options: {
                Size: "XL",
                Color: "Default",
              },
              prices: [
                {
                  amount: 950,
                  currency_code: "inr",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },

        // --- PRINTED SHIRT ---
        {
          title: "Artistic Print Shirt",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Printed Shirts").id,
          ],
          description:
            "Express your unique style with our Artistic Print Shirt. This shirt features a vibrant, abstract print on a comfortable cotton base.",
          handle: "artistic-print-shirt",
          weight: 275,
          status: ProductStatus.PUBLISHED,
          images: [
            {
              url: "https://via.placeholder.com/600x800?text=Printed+Front", // Placeholder image
            },
            {
              url: "https://via.placeholder.com/600x800?text=Printed+Back", // Placeholder image
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
            {
              title: "Color",
              values: ["Default"], // Single color variant
            }
          ],
          variants: [
            {
              title: "S / Default",
              sku: "PRINTED-S-DEFAULT",
              options: {
                Size: "S",
                Color: "Default",
              },
              prices: [
                {
                  amount: 1100,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "M / Default",
              sku: "PRINTED-M-DEFAULT",
              options: {
                Size: "M",
                Color: "Default",
              },
              prices: [
                {
                  amount: 1100,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "L / Default",
              sku: "PRINTED-L-DEFAULT",
              options: {
                Size: "L",
                Color: "Default",
              },
              prices: [
                {
                  amount: 1100,
                  currency_code: "inr",
                },
              ],
            },
            {
              title: "XL / Default",
              sku: "PRINTED-XL-DEFAULT",
              options: {
                Size: "XL",
                Color: "Default",
              },
              prices: [
                {
                  amount: 1100,
                  currency_code: "inr",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
      ],
    },
  });
  logger.info("Finished seeding product data.");

  logger.info("Seeding inventory levels.");

  const { data: inventoryItems } = await query.graph({
    entity: 'inventory_item',
    fields: ['id']
  })

  const inventoryLevels = []
  for (const inventoryItem of inventoryItems) {
    const inventoryLevel = {
      location_id: stockLocation.id,
      stocked_quantity: 20,
      inventory_item_id: inventoryItem.id,
    }
    inventoryLevels.push(inventoryLevel)
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryLevels
    },
  })

  logger.info("Finished seeding inventory levels data.");
}
