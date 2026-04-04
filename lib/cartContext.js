'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CartContext = createContext();

function getMaxCartQuantity(product) {
    const rawStock = product?.availableStock ?? product?.stock;
    if (rawStock === null || rawStock === undefined || rawStock === '') {
        return null;
    }

    const parsed = Number(rawStock);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    return Math.max(0, Math.floor(parsed));
}

export function CartProvider({ children }) {
    const [cart, setCart] = useState([]);
    const [toast, setToast] = useState(null);
    const [rentalDays, setRentalDaysState] = useState(1);

    useEffect(() => {
        const saved = localStorage.getItem('pico-cart');
        if (saved) {
            try { setCart(JSON.parse(saved)); } catch { }
        }
        const savedDays = localStorage.getItem('pico-rental-days');
        if (savedDays) {
            const d = parseInt(savedDays);
            if (d > 0) setRentalDaysState(d);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('pico-cart', JSON.stringify(cart));
    }, [cart]);

    const setRentalDays = useCallback((days) => {
        const d = Math.max(1, parseInt(days) || 1);
        setRentalDaysState(d);
        localStorage.setItem('pico-rental-days', String(d));
    }, []);

    const addToCart = useCallback((product, quantity = 1, comment = '') => {
        let nextToast = 'Added to cart';

        setCart(prev => {
            const maxQty = getMaxCartQuantity(product);
            const qtyToAdd = Math.max(1, parseInt(quantity, 10) || 1);
            const existing = prev.find(item => item.id === product.id);
            const existingQty = existing?.quantity || 0;

            if (maxQty === 0 || product?.inStock === false) {
                nextToast = 'This item is out of stock';
                return prev;
            }

            const requestedQty = existingQty + qtyToAdd;
            const finalQty = maxQty === null ? requestedQty : Math.min(requestedQty, maxQty);

            if (finalQty <= existingQty) {
                nextToast = 'Maximum available quantity is already in your cart';
                return prev;
            }

            if (maxQty !== null && finalQty < requestedQty) {
                nextToast = `Cart updated to ${maxQty} available item${maxQty === 1 ? '' : 's'}`;
            }

            if (existing) {
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: finalQty, comment: comment || item.comment }
                        : item
                );
            }

            return [...prev, { ...product, quantity: finalQty, comment }];
        });

        setToast(nextToast);
        setTimeout(() => setToast(null), 3000);
    }, []);

    const removeFromCart = useCallback((productId) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    }, []);

    const updateQuantity = useCallback((productId, quantity) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === productId);
            if (!existing) return prev;

            const requestedQty = parseInt(quantity, 10) || 0;
            if (requestedQty <= 0) {
                return prev.filter(item => item.id !== productId);
            }

            const maxQty = getMaxCartQuantity(existing);
            const finalQty = maxQty === null ? requestedQty : Math.min(requestedQty, maxQty);
            if (finalQty <= 0) {
                return prev.filter(item => item.id !== productId);
            }

            return prev.map(item =>
                item.id === productId ? { ...item, quantity: finalQty } : item
            );
        });
    }, []);

    const clearCart = useCallback(() => {
        setCart([]);
    }, []);

    const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const grandTotal = cartTotal * rentalDays;

    return (
        <CartContext.Provider value={{
            cart, addToCart, removeFromCart, updateQuantity, clearCart,
            cartTotal, cartCount, toast,
            rentalDays, setRentalDays, grandTotal,
        }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) throw new Error('useCart must be used within CartProvider');
    return context;
}
