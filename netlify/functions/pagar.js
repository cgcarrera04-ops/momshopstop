// Este es el backend (Netlify Function) que se comunica con Mercado Pago de forma segura
exports.handler = async (event, context) => {
    // 1. Evitar errores de CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTION'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // 2. Recibimos el carrito Y LOS DATOS DE ENVÍO que envía tu HTML
        const { cart, shippingData } = JSON.parse(event.body);

        // 3. Transformamos tu carrito al formato de Mercado Pago
        const items = cart.map(producto => ({
            title: producto.name,
            description: producto.shortDesc,
            picture_url: producto.image,
            category_id: "health_and_beauty",
            quantity: producto.quantity,
            currency_id: "PEN",
            unit_price: parseFloat(producto.price)
        }));

        let subtotal = cart.reduce((total, producto) => total + (parseFloat(producto.price) * producto.quantity), 0);
        let costoEnvio = 0;

        // 3.1 Agregar el Costo de Envío dinámico (si existe)
        if (shippingData && shippingData.shippingCost > 0) {
            costoEnvio = parseFloat(shippingData.shippingCost);
            items.push({
                title: "Costo de Envío",
                description: `Envío a ${shippingData.dept} - ${shippingData.dist}`,
                category_id: "shipping",
                quantity: 1,
                currency_id: "PEN",
                unit_price: costoEnvio
            });
        }

        // 3.2 Calcular el recargo del 4.5% sobre el Total (Subtotal + Envío)
        const totalConEnvio = subtotal + costoEnvio;
        const porcentajeRecargo = 0.045; 
        const recargo = totalConEnvio * porcentajeRecargo; 

        items.push({
            title: "Cargo por servicio (Pagos con Tarjeta)",
            description: "Recargo por procesamiento de pago en plataforma",
            quantity: 1,
            currency_id: "PEN",
            unit_price: parseFloat(recargo.toFixed(2)) 
        });

        // 4. Construimos la "Preferencia de Pago" INYECTANDO LA INFO DEL CLIENTE
        const preferenceData = {
            items: items,
            // AQUÍ ESTÁ LA MAGIA: Le pasamos los datos del formulario a Mercado Pago
            payer: {
                name: shippingData ? shippingData.name : "Cliente",
                phone: {
                    area_code: "51",
                    number: shippingData ? shippingData.phone : ""
                },
                address: {
                    street_name: shippingData ? `${shippingData.address}, ${shippingData.dist}, ${shippingData.dept}. Ref: ${shippingData.ref}` : "Sin dirección"
                }
            },
            back_urls: {
                success: "https://momshopstop.netlify.app/", // Cambiar por tu URL luego
                failure: "https://momshopstop.netlify.app/",
                pending: "https://momshopstop.netlify.app/"
            },
            auto_return: "approved",
            statement_descriptor: "MOM SHOP STOP"
        };

        // 5. Nos comunicamos con Mercado Pago
        const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}`, // Tu token de Mercado Pago
                "Content-Type": "application/json"
            },
            body: JSON.stringify(preferenceData)
        });

        const data = await response.json();

        // 6. Devolvemos el link
        if (response.ok) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ init_point: data.init_point }) 
            };
        } else {
            console.error("Error de Mercado Pago:", data);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "No se pudo crear el pago en Mercado Pago." })
            };
        }

    } catch (error) {
        console.error("Error interno:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Error en el servidor de Netlify." })
        };
    }

};
